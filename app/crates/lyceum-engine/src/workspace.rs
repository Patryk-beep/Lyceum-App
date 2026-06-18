//! Plugin staging + validation. Vendored plugin source → staged copy whose tree is
//! validated (all 9 SKILL.md + plugin.json + the three load-bearing references)
//! before it is handed to `--plugin-dir`.

use std::path::{Path, PathBuf};

use crate::error::{EngineError, Result};

pub const LYCEUM_SKILLS: &[&str] = &[
    "assess-understanding",
    "build-curriculum",
    "capstone",
    "create-assignment",
    "learn",
    "placement-test",
    "research-topic",
    "review-session",
    "teach-lesson",
];

pub const REQUIRED_REFERENCES: &[&str] = &["MANIFEST.md", "REFERENCE.md", "LEVELS.md"];

/// Validate that a directory is a complete lyceum plugin tree.
pub fn validate_plugin(dir: &Path) -> Result<()> {
    let must_exist = |p: PathBuf| -> Result<()> {
        let meta = std::fs::metadata(&p)
            .map_err(|_| EngineError::InvalidPlugin(format!("missing {}", p.display())))?;
        if meta.len() == 0 {
            return Err(EngineError::InvalidPlugin(format!("empty {}", p.display())));
        }
        Ok(())
    };

    must_exist(dir.join(".claude-plugin/plugin.json"))?;
    for skill in LYCEUM_SKILLS {
        must_exist(dir.join("skills").join(skill).join("SKILL.md"))?;
    }
    for r in REQUIRED_REFERENCES {
        must_exist(dir.join("references").join(r))?;
    }
    Ok(())
}

/// Stage the plugin: copy `src` into `dest_dir` atomically-ish (copy to a temp
/// sibling, validate, then swap into place), returning the staged plugin path.
pub fn stage_plugin(src: &Path, dest_dir: &Path) -> Result<PathBuf> {
    validate_plugin(src)?; // source must already be valid

    let staged = dest_dir.join("lyceum");
    let tmp = dest_dir.join(".lyceum.staging");
    if tmp.exists() {
        let _ = std::fs::remove_dir_all(&tmp);
    }
    std::fs::create_dir_all(dest_dir)?;
    copy_dir_all(src, &tmp).map_err(|e| EngineError::Staging(e.to_string()))?;
    validate_plugin(&tmp)?;

    if staged.exists() {
        std::fs::remove_dir_all(&staged)?;
    }
    std::fs::rename(&tmp, &staged)
        .map_err(|e| EngineError::Staging(format!("swap into place: {e}")))?;
    Ok(staged)
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&from, &to)?;
        } else {
            std::fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vendored() -> PathBuf {
        PathBuf::from(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../src-tauri/resources/lyceum"
        ))
    }

    #[test]
    fn vendored_plugin_validates() {
        validate_plugin(&vendored()).expect("vendored plugin tree is complete");
    }

    #[test]
    fn staging_copies_and_validates() {
        let tmp = tempfile::tempdir().unwrap();
        let staged = stage_plugin(&vendored(), tmp.path()).unwrap();
        assert!(staged.join(".claude-plugin/plugin.json").is_file());
        validate_plugin(&staged).unwrap();
        // restaging over an existing copy is fine (idempotent swap)
        let staged2 = stage_plugin(&vendored(), tmp.path()).unwrap();
        assert_eq!(staged, staged2);
    }

    #[test]
    fn validate_rejects_incomplete_tree() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join(".claude-plugin")).unwrap();
        std::fs::write(tmp.path().join(".claude-plugin/plugin.json"), "{}").unwrap();
        assert!(validate_plugin(tmp.path()).is_err());
    }
}
