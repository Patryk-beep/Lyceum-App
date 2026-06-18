//! Atomic, canonical, corrupt-aware manifest persistence.
//!
//! `save` is the ONLY deterministic write path. It snapshots a timestamped backup
//! (ring of 5), serializes pretty (preserving order), writes a `.tmp`, fsyncs, and
//! renames over the target so a crash never leaves a torn manifest.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use time::Date;

use crate::error::{CoreError, Result};
use crate::model::Manifest;

const BACKUP_RING: usize = 5;

/// Load and parse a manifest. `transient` is set on the returned `Corrupt` error
/// when the failure looks like a half-written file (empty / truncated), so a
/// watcher-path caller can retry instead of surfacing terminal corruption.
pub fn load(path: &Path) -> Result<Manifest> {
    let bytes = fs::read(path)?;
    parse(&bytes)
}

/// Parse manifest bytes, classifying transient vs real corruption.
pub fn parse(bytes: &[u8]) -> Result<Manifest> {
    if bytes.is_empty() {
        return Err(CoreError::Corrupt {
            transient: true,
            message: "empty file".into(),
        });
    }
    match serde_json::from_slice::<Manifest>(bytes) {
        Ok(m) => Ok(m),
        Err(e) => {
            // EOF-while-parsing strongly suggests a truncated/half-written file.
            let transient = e.is_eof();
            Err(CoreError::Corrupt {
                transient,
                message: e.to_string(),
            })
        }
    }
}

/// Save the manifest atomically. Bumps `updated` to `today`. `backup_stamp` is a
/// caller-provided unique label (e.g. `2026-06-18T14-30-05`) for the backup file —
/// the pure core never reads a clock.
pub fn save(path: &Path, manifest: &mut Manifest, today: Date, backup_stamp: &str) -> Result<()> {
    manifest.updated = today;

    // 1. Snapshot the existing file into the backup ring (best-effort, pre-write).
    if path.exists() {
        snapshot_backup(path, backup_stamp)?;
    }

    // 2. Serialize pretty, preserving field/insertion order.
    let json = serde_json::to_string_pretty(manifest)?;

    // 3. Write to a temp file in the same directory, fsync, atomic rename.
    let dir = path
        .parent()
        .ok_or_else(|| CoreError::Io(format!("manifest path has no parent: {}", path.display())))?;
    fs::create_dir_all(dir)?;
    let tmp = tmp_path(path);
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(json.as_bytes())?;
        f.write_all(b"\n")?;
        f.sync_all()?;
    }
    // Atomic replace.
    if let Err(e) = fs::rename(&tmp, path) {
        // Never leave a stray .tmp behind on failure.
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    // fsync the directory so the rename is durable (best-effort; ignore on platforms
    // that reject opening a dir for sync).
    if let Ok(dirf) = fs::File::open(dir) {
        let _ = dirf.sync_all();
    }
    Ok(())
}

fn tmp_path(path: &Path) -> PathBuf {
    let mut s = path.as_os_str().to_owned();
    s.push(".tmp");
    PathBuf::from(s)
}

fn backups_dir(path: &Path) -> PathBuf {
    path.parent().unwrap_or(Path::new(".")).join(".backups")
}

/// Copy the current manifest into `.backups/manifest-<stamp>.json`, keeping the
/// newest `BACKUP_RING` and pruning the rest (ISO-style stamps sort lexically).
fn snapshot_backup(path: &Path, stamp: &str) -> Result<()> {
    let dir = backups_dir(path);
    fs::create_dir_all(&dir)?;
    let dest = dir.join(format!("manifest-{stamp}.json"));
    fs::copy(path, &dest)?;

    let mut backups: Vec<PathBuf> = fs::read_dir(&dir)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with("manifest-") && n.ends_with(".json"))
                .unwrap_or(false)
        })
        .collect();
    backups.sort();
    while backups.len() > BACKUP_RING {
        let oldest = backups.remove(0);
        let _ = fs::remove_file(oldest);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::base_manifest;
    use time::macros::date;

    #[test]
    fn roundtrip_byte_stable_through_disk() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("manifest.json");
        let mut m = base_manifest();
        save(&path, &mut m, date!(2026 - 06 - 18), "2026-06-18T00-00-00").unwrap();
        let loaded = load(&path).unwrap();
        assert_eq!(loaded, m);
    }

    #[test]
    fn save_bumps_updated() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("manifest.json");
        let mut m = base_manifest();
        save(&path, &mut m, date!(2026 - 12 - 25), "s1").unwrap();
        assert_eq!(m.updated, date!(2026 - 12 - 25));
    }

    #[test]
    fn no_tmp_survives_a_successful_save() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("manifest.json");
        let mut m = base_manifest();
        save(&path, &mut m, date!(2026 - 06 - 18), "s1").unwrap();
        let stray = tmp_path(&path);
        assert!(!stray.exists());
    }

    #[test]
    fn backup_ring_keeps_only_five() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("manifest.json");
        let mut m = base_manifest();
        // 8 saves -> first creates the file (no backup), 7 subsequent snapshot it.
        for i in 0..8 {
            let stamp = format!("2026-06-18T00-00-{i:02}");
            save(&path, &mut m, date!(2026 - 06 - 18), &stamp).unwrap();
        }
        let dir = backups_dir(&path);
        let count = fs::read_dir(&dir).unwrap().count();
        assert_eq!(count, BACKUP_RING);
    }

    #[test]
    fn empty_file_is_transient_corrupt() {
        let err = parse(b"").unwrap_err();
        match err {
            CoreError::Corrupt { transient, .. } => assert!(transient),
            other => panic!("expected transient corrupt, got {other:?}"),
        }
    }

    #[test]
    fn truncated_json_is_transient_corrupt() {
        let err = parse(b"{\"subject\": \"x\"").unwrap_err();
        match err {
            CoreError::Corrupt { transient, .. } => assert!(transient),
            other => panic!("expected transient corrupt, got {other:?}"),
        }
    }

    #[test]
    fn garbage_is_nontransient_corrupt() {
        let err = parse(b"not json at all !!!").unwrap_err();
        match err {
            CoreError::Corrupt { transient, .. } => assert!(!transient),
            other => panic!("expected corrupt, got {other:?}"),
        }
    }
}
