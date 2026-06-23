//! Student notebook — app-owned Markdown notes, one folder per subject, each note
//! optionally anchored to a lesson's module. Mirrors the app-owned-file discipline
//! of `submit.rs` / `tutor.rs`:
//!   - **validate the slug** AND **the notebook id** before any path join — a `..`
//!     or `/` in either would otherwise escape `learning/<slug>/notebooks/`.
//!   - notes live as `notebooks/<nbNNN>.md` (the content) + `notebooks/<nbNNN>.json`
//!     (a metadata sidecar: title, created/updated dates, optional moduleId, tags).
//!   - **NEVER the manifest** — notebooks stay fully outside the
//!     single-writer-for-mastery boundary (like `tutor-thread.json`,
//!     `placement-answer.json`). No `store.rs`, no `review_queue`, no `objective.mastery`.
//!   - **content file first, sidecar second**: a crash between leaves a content-only
//!     note that the listing safely skips (no corruption), never a titled note with
//!     no body. Deletion is idempotent (a missing file is success).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use time::Date;

use crate::delete::{contained_path, validate_slug};
use crate::error::{AppError, AppResult};
use crate::workspace;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// The on-disk sidecar (`notebooks/<id>.json`). The `.md` holds the body; this
/// holds everything else so the Markdown file stays a clean, exportable note.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NotebookMeta {
    title: String,
    #[serde(with = "lyceum_core::date::iso")]
    created_at: Date,
    #[serde(with = "lyceum_core::date::iso")]
    updated_at: Date,
    /// The stable `ModuleId` this note was taken against (NOT a lesson filename or
    /// title — those go stale across a curriculum rebuild). `None` for a free note.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    module_id: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
}

/// The full note as handed to the webview: the sidecar metadata + the body + id.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookEntry {
    pub id: String,
    pub title: String,
    pub content: String,
    #[serde(with = "lyceum_core::date::iso")]
    pub created_at: Date,
    #[serde(with = "lyceum_core::date::iso")]
    pub updated_at: Date,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub module_id: Option<String>,
    pub tags: Vec<String>,
}

fn into_entry(id: String, meta: NotebookMeta, content: String) -> NotebookEntry {
    NotebookEntry {
        id,
        title: meta.title,
        content,
        created_at: meta.created_at,
        updated_at: meta.updated_at,
        module_id: meta.module_id,
        tags: meta.tags,
    }
}

// ---------------------------------------------------------------------------
// Id + path guards
// ---------------------------------------------------------------------------

/// A notebook id is `nb` followed by one or more digits (e.g. `nb001`). Like
/// [`validate_slug`], this single rule rejects ``, `.`, `..`, `/`, `\`, and any
/// other component that could escape the notebooks dir — checked BEFORE any join.
fn validate_notebook_id(id: &str) -> AppResult<()> {
    let ok = id.len() > 2 && id.starts_with("nb") && id[2..].bytes().all(|b| b.is_ascii_digit());
    if ok {
        Ok(())
    } else {
        Err(AppError::msg(format!("illegal notebook id: {id:?}")))
    }
}

/// Numeric suffix of a `nbNNN` id (`nb007` -> 7); `None` if not a notebook id.
fn id_number(id: &str) -> Option<u32> {
    id.strip_prefix("nb").and_then(|d| d.parse().ok())
}

fn notebooks_dir(ws: &Path, slug: &str) -> PathBuf {
    workspace::subject_dir(ws, slug).join("notebooks")
}

/// Contained path to one of a note's two files (`ext` = `"md"` | `"json"`). The id
/// is validated first; `contained_path` is the belt-and-suspenders second guard.
fn note_path(ws: &Path, slug: &str, id: &str, ext: &str) -> AppResult<PathBuf> {
    validate_notebook_id(id)?;
    contained_path(ws, slug, &format!("notebooks/{id}.{ext}"))
}

// ---------------------------------------------------------------------------
// IO helpers
// ---------------------------------------------------------------------------

fn read_meta(ws: &Path, slug: &str, id: &str) -> AppResult<NotebookMeta> {
    let raw = std::fs::read_to_string(note_path(ws, slug, id, "json")?)?;
    Ok(serde_json::from_str(&raw)?)
}

/// Write the body THEN the sidecar (a half-written note lists as invisible, never
/// as a titled note with no body). Creates `notebooks/` on first write.
fn write_note(
    ws: &Path,
    slug: &str,
    id: &str,
    content: &str,
    meta: &NotebookMeta,
) -> AppResult<()> {
    let md = note_path(ws, slug, id, "md")?;
    if let Some(parent) = md.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&md, content)?;
    std::fs::write(
        note_path(ws, slug, id, "json")?,
        serde_json::to_string_pretty(meta)?,
    )?;
    Ok(())
}

/// Remove a file, tolerating an already-absent target (idempotent double-delete).
fn remove_idempotent(path: &Path) -> AppResult<()> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}

/// The next free `nbNNN` id (max existing numeric suffix + 1, zero-padded to 3).
fn next_id(ws: &Path, slug: &str) -> AppResult<String> {
    let max = match std::fs::read_dir(notebooks_dir(ws, slug)) {
        Ok(rd) => rd
            .flatten()
            .filter_map(|e| e.file_name().into_string().ok())
            .filter_map(|n| n.strip_suffix(".md").map(str::to_string))
            .filter_map(|id| id_number(&id))
            .max()
            .unwrap_or(0),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => 0,
        Err(e) => return Err(e.into()),
    };
    Ok(format!("nb{:03}", max + 1))
}

// ---------------------------------------------------------------------------
// Public service surface (CRUD) — all `AppResult`, never panics
// ---------------------------------------------------------------------------

/// Every note for a subject, newest-updated first (tie-break: higher id = more
/// recent). A note whose sidecar is missing or corrupt is skipped, not fatal, so
/// one bad file never blanks the whole notebook. Missing `notebooks/` dir -> `[]`.
pub fn list_notebooks(ws: &Path, slug: &str) -> AppResult<Vec<NotebookEntry>> {
    validate_slug(slug)?;
    let rd = match std::fs::read_dir(notebooks_dir(ws, slug)) {
        Ok(rd) => rd,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e.into()),
    };

    let mut entries: Vec<NotebookEntry> = rd
        .flatten()
        .filter_map(|e| e.file_name().into_string().ok())
        .filter_map(|n| n.strip_suffix(".md").map(str::to_string))
        .filter(|id| validate_notebook_id(id).is_ok())
        .filter_map(|id| {
            let meta = read_meta(ws, slug, &id).ok()?; // skip a note with no/bad sidecar
            let content = std::fs::read_to_string(note_path(ws, slug, &id, "md").ok()?).ok()?;
            Some(into_entry(id, meta, content))
        })
        .collect();

    entries.sort_by(|a, b| {
        b.updated_at
            .cmp(&a.updated_at)
            .then_with(|| id_number(&b.id).cmp(&id_number(&a.id)))
    });
    Ok(entries)
}

/// One note by id. Errors (not found) if it does not exist.
pub fn read_notebook(ws: &Path, slug: &str, id: &str) -> AppResult<NotebookEntry> {
    validate_slug(slug)?;
    validate_notebook_id(id)?;
    if !note_path(ws, slug, id, "md")?.is_file() {
        return Err(AppError::msg(format!("notebook {id} not found")));
    }
    let meta = read_meta(ws, slug, id)?;
    let content = std::fs::read_to_string(note_path(ws, slug, id, "md")?)?;
    Ok(into_entry(id.to_string(), meta, content))
}

/// Create a note (auto-allocated id). `module_id` anchors it to a lesson's module.
pub fn create_notebook(
    ws: &Path,
    slug: &str,
    title: &str,
    content: &str,
    module_id: Option<&str>,
    today: Date,
) -> AppResult<NotebookEntry> {
    validate_slug(slug)?;
    let id = next_id(ws, slug)?;
    let meta = NotebookMeta {
        title: title.to_string(),
        created_at: today,
        updated_at: today,
        module_id: module_id.map(str::to_string),
        tags: Vec::new(),
    };
    write_note(ws, slug, &id, content, &meta)?;
    Ok(into_entry(id, meta, content.to_string()))
}

/// Overwrite a note's title + body and bump `updatedAt`. `createdAt`, `moduleId`,
/// and `tags` are preserved. Errors if the note does not exist (no silent upsert).
pub fn update_notebook(
    ws: &Path,
    slug: &str,
    id: &str,
    title: &str,
    content: &str,
    today: Date,
) -> AppResult<NotebookEntry> {
    validate_slug(slug)?;
    validate_notebook_id(id)?;
    if !note_path(ws, slug, id, "md")?.is_file() {
        return Err(AppError::msg(format!("notebook {id} not found")));
    }
    let mut meta = read_meta(ws, slug, id)?;
    meta.title = title.to_string();
    meta.updated_at = today;
    write_note(ws, slug, id, content, &meta)?;
    Ok(into_entry(id.to_string(), meta, content.to_string()))
}

/// Remove a note (body + sidecar). Idempotent: deleting a missing note succeeds.
pub fn delete_notebook(ws: &Path, slug: &str, id: &str) -> AppResult<()> {
    validate_slug(slug)?;
    validate_notebook_id(id)?;
    remove_idempotent(&note_path(ws, slug, id, "md")?)?;
    remove_idempotent(&note_path(ws, slug, id, "json")?)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::date;

    const D1: Date = date!(2026 - 06 - 20);
    const D2: Date = date!(2026 - 06 - 21);
    const SLUG: &str = "conversational-spanish";

    fn ws() -> tempfile::TempDir {
        let tmp = tempfile::tempdir().unwrap();
        // notebook is manifest-independent; the subject dir is created lazily.
        std::fs::create_dir_all(workspace::subject_dir(tmp.path(), SLUG)).unwrap();
        tmp
    }

    // --- happy path -----------------------------------------------------------

    #[test]
    fn create_then_read_round_trips() {
        let tmp = ws();
        let made =
            create_notebook(tmp.path(), SLUG, "Verbs", "ser vs estar", Some("m02"), D1).unwrap();
        assert_eq!(made.id, "nb001");
        assert_eq!(made.created_at, D1);
        assert_eq!(made.updated_at, D1);
        assert_eq!(made.module_id.as_deref(), Some("m02"));
        assert!(made.tags.is_empty());

        let got = read_notebook(tmp.path(), SLUG, "nb001").unwrap();
        assert_eq!(got, made, "read returns exactly what create wrote");
        assert_eq!(got.content, "ser vs estar");
    }

    #[test]
    fn ids_allocate_sequentially_zero_padded() {
        let tmp = ws();
        for (i, want) in [(0, "nb001"), (1, "nb002"), (2, "nb003")] {
            let e = create_notebook(tmp.path(), SLUG, &format!("n{i}"), "x", None, D1).unwrap();
            assert_eq!(e.id, want);
        }
    }

    #[test]
    fn list_is_newest_updated_first() {
        let tmp = ws();
        create_notebook(tmp.path(), SLUG, "old", "a", None, D1).unwrap(); // nb001
        create_notebook(tmp.path(), SLUG, "new", "b", None, D2).unwrap(); // nb002
        let list = list_notebooks(tmp.path(), SLUG).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, "nb002", "later updatedAt sorts first");
        assert_eq!(list[1].id, "nb001");
    }

    #[test]
    fn list_tie_breaks_by_id_descending() {
        let tmp = ws();
        create_notebook(tmp.path(), SLUG, "first", "a", None, D1).unwrap(); // nb001, same day
        create_notebook(tmp.path(), SLUG, "second", "b", None, D1).unwrap(); // nb002, same day
        let list = list_notebooks(tmp.path(), SLUG).unwrap();
        assert_eq!(
            list[0].id, "nb002",
            "same day -> higher id (more recent) first"
        );
    }

    #[test]
    fn update_preserves_created_and_module_bumps_updated() {
        let tmp = ws();
        create_notebook(tmp.path(), SLUG, "draft", "v1", Some("m03"), D1).unwrap();
        let upd = update_notebook(tmp.path(), SLUG, "nb001", "final", "v2", D2).unwrap();
        assert_eq!(upd.created_at, D1, "createdAt preserved");
        assert_eq!(upd.updated_at, D2, "updatedAt bumped");
        assert_eq!(upd.module_id.as_deref(), Some("m03"), "moduleId preserved");
        assert_eq!(upd.title, "final");
        assert_eq!(upd.content, "v2");
        // and it persisted
        assert_eq!(read_notebook(tmp.path(), SLUG, "nb001").unwrap(), upd);
    }

    #[test]
    fn delete_is_idempotent_and_removes_from_list() {
        let tmp = ws();
        create_notebook(tmp.path(), SLUG, "t", "x", None, D1).unwrap();
        delete_notebook(tmp.path(), SLUG, "nb001").unwrap();
        assert!(read_notebook(tmp.path(), SLUG, "nb001").is_err());
        assert!(list_notebooks(tmp.path(), SLUG).unwrap().is_empty());
        // double-delete + never-existed both succeed
        delete_notebook(tmp.path(), SLUG, "nb001").unwrap();
        delete_notebook(tmp.path(), SLUG, "nb999").unwrap();
    }

    #[test]
    fn content_round_trips_special_characters() {
        let tmp = ws();
        let body = "# Heading\n\n```js\nconst x = \"hola\";\n```\n- [ ] todo\ncafé ☕ — \\n\tend";
        create_notebook(tmp.path(), SLUG, "rich", body, None, D1).unwrap();
        assert_eq!(
            read_notebook(tmp.path(), SLUG, "nb001").unwrap().content,
            body
        );
    }

    // --- guards ---------------------------------------------------------------

    #[test]
    fn rejects_bad_slug_on_every_op() {
        let tmp = ws();
        assert!(create_notebook(tmp.path(), "../escape", "t", "x", None, D1).is_err());
        assert!(list_notebooks(tmp.path(), "../escape").is_err());
        assert!(read_notebook(tmp.path(), "../escape", "nb001").is_err());
        assert!(update_notebook(tmp.path(), "../escape", "nb001", "t", "x", D1).is_err());
        assert!(delete_notebook(tmp.path(), "../escape", "nb001").is_err());
    }

    #[test]
    fn rejects_bad_notebook_id() {
        let tmp = ws();
        for bad in ["", "nb", "note1", "../nb001", "nb001/../x", "nb 1", "NB001"] {
            assert!(
                read_notebook(tmp.path(), SLUG, bad).is_err(),
                "read {bad:?}"
            );
            assert!(
                delete_notebook(tmp.path(), SLUG, bad).is_err(),
                "delete {bad:?}"
            );
            assert!(
                update_notebook(tmp.path(), SLUG, bad, "t", "x", D1).is_err(),
                "update {bad:?}"
            );
        }
    }

    #[test]
    fn update_missing_note_errors() {
        let tmp = ws();
        assert!(update_notebook(tmp.path(), SLUG, "nb001", "t", "x", D1).is_err());
    }

    // --- tolerance ------------------------------------------------------------

    #[test]
    fn list_missing_dir_is_empty() {
        let tmp = ws();
        assert!(list_notebooks(tmp.path(), SLUG).unwrap().is_empty());
    }

    #[test]
    fn list_skips_note_with_missing_or_corrupt_sidecar() {
        let tmp = ws();
        create_notebook(tmp.path(), SLUG, "good", "x", None, D1).unwrap(); // nb001
        let dir = notebooks_dir(tmp.path(), SLUG);
        // a body with no sidecar
        std::fs::write(dir.join("nb002.md"), "orphan body").unwrap();
        // a body with a corrupt sidecar
        std::fs::write(dir.join("nb003.md"), "body").unwrap();
        std::fs::write(dir.join("nb003.json"), "{ not json").unwrap();

        let list = list_notebooks(tmp.path(), SLUG).unwrap();
        assert_eq!(list.len(), 1, "only the well-formed note is listed");
        assert_eq!(list[0].id, "nb001");
    }
}
