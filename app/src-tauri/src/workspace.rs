//! Workspace path helpers + disk-state probing. The workspace root is
//! `<appLocalData>/workspace`; one folder per subject lives under `learning/`.

use std::path::{Path, PathBuf};

use lyceum_core::routing::DiskState;
use time::{Date, OffsetDateTime};

pub fn learning_dir(workspace: &Path) -> PathBuf {
    workspace.join("learning")
}

pub fn subject_dir(workspace: &Path, slug: &str) -> PathBuf {
    learning_dir(workspace).join(slug)
}

pub fn manifest_path(workspace: &Path, slug: &str) -> PathBuf {
    subject_dir(workspace, slug).join("manifest.json")
}

/// Today's civil date (UTC). The per-subject civil-date offset contract is a
/// future refinement; UTC is correct for scheduling within a session.
pub fn today() -> Date {
    OffsetDateTime::now_utc().date()
}

/// A unique, sortable, filesystem-safe stamp for the manifest backup ring.
pub fn backup_stamp() -> String {
    let n = OffsetDateTime::now_utc();
    format!(
        "{:04}-{:02}-{:02}T{:02}-{:02}-{:02}-{:09}",
        n.year(),
        u8::from(n.month()),
        n.day(),
        n.hour(),
        n.minute(),
        n.second(),
        n.nanosecond()
    )
}

/// Probe which generated artifacts exist for a subject (drives routing/summary
/// without `lyceum-core` ever touching the filesystem).
pub fn disk_state(workspace: &Path, slug: &str) -> DiskState {
    let dir = subject_dir(workspace, slug);
    DiskState {
        has_research: dir.join("research.md").is_file(),
        has_knowledge_map: dir.join("knowledge-map.json").is_file(),
        has_curriculum_json: dir.join("curriculum.json").is_file(),
    }
}

/// Slugs of every subject under `learning/` that has a `manifest.json`.
pub fn list_slugs(workspace: &Path) -> Vec<String> {
    let dir = learning_dir(workspace);
    let mut slugs: Vec<String> = match std::fs::read_dir(&dir) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .filter(|e| e.path().join("manifest.json").is_file())
            .filter_map(|e| e.file_name().to_str().map(|s| s.to_string()))
            .collect(),
        Err(_) => Vec::new(),
    };
    slugs.sort();
    slugs
}
