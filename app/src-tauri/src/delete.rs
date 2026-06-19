//! Deletion / reset operations + the shared path-safety guards.
//!
//! Every destructive command (subject / lesson / assignment / curriculum reset)
//! is a pure, headless-testable service function here. The hard rules, folded in
//! from a map→design→red-team pass:
//!   - **validate the slug** against the slugify charset BEFORE any path join (a
//!     slug of `.` or `` would otherwise wipe the workspace).
//!   - **contain every path** inside the subject dir (reject `..` / absolute /
//!     Windows-drive components) — components-based, no canonicalize needed.
//!   - **mutate → validate → save → delete-file**: persist the manifest BEFORE
//!     removing the on-disk artifact, and HALT (no save, no delete) if the
//!     mutation would fail `lyceum_core::validate`. A surviving orphan file is
//!     benign; a manifest that references a deleted file is the break we avoid.
//!   - **single-writer-for-mastery**: these never fabricate `objective.mastery`.

use std::path::{Component, Path, PathBuf};
use std::time::Duration;

use serde::Serialize;
use time::Date;

use lyceum_core::model::{
    AssignmentStatus, CurrentStatus, HistoryEntry, Manifest, ModuleStatus, Phase, ScaleStart,
};
use lyceum_core::routing::{derive_route, Route};
use lyceum_core::{store, validate};

use crate::error::{AppError, AppResult};
use crate::workspace;

// ---------------------------------------------------------------------------
// Path-safety guards (single source of truth, reused by read_artifact too).
// ---------------------------------------------------------------------------

/// A slug must be a single path segment in the slugify charset `[a-z0-9-]`. This
/// one rule rejects ``, `.`, `..`, `/`, `\`, whitespace, and Windows drive
/// letters — anything that could escape `learning/<slug>/`.
pub(crate) fn validate_slug(slug: &str) -> AppResult<()> {
    let ok = !slug.is_empty()
        && slug
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');
    if ok {
        Ok(())
    } else {
        Err(AppError::msg(format!("illegal subject slug: {slug:?}")))
    }
}

/// Join `relpath` onto the subject dir ONLY if it stays inside it: relative, with
/// only normal (or `.`) components — no `..`, root, or Windows-drive prefix.
pub(crate) fn contained_path(ws: &Path, slug: &str, relpath: &str) -> AppResult<PathBuf> {
    let rel = Path::new(relpath);
    let safe = !relpath.is_empty()
        && rel
            .components()
            .all(|c| matches!(c, Component::Normal(_) | Component::CurDir));
    if !safe {
        return Err(AppError::msg(format!("illegal artifact path: {relpath:?}")));
    }
    Ok(workspace::subject_dir(ws, slug).join(rel))
}

/// `file` must be a single bare filename (no directory parts, no `..`).
fn ensure_bare_filename(file: &str) -> AppResult<()> {
    let mut comps = Path::new(file).components();
    match (comps.next(), comps.next()) {
        (Some(Component::Normal(_)), None) => Ok(()),
        _ => Err(AppError::msg(format!("illegal lesson filename: {file:?}"))),
    }
}

/// Windows-only transient file-lock predicate (`ERROR_SHARING_VIOLATION` /
/// `ERROR_ACCESS_DENIED`). Always false on Unix, so the retry below is a plain
/// `remove_dir_all` there. Mirrors `store.rs`'s rename retry.
fn transient_lock(e: &std::io::Error) -> bool {
    cfg!(windows) && matches!(e.raw_os_error(), Some(32) | Some(5))
}

/// `remove_dir_all` with a bounded backoff on a transient Windows lock (AV /
/// Search indexer / the Claude child briefly holding a file). Worst case ~1s,
/// Windows-only. ponytail: bounded retry, not a watcher — fine for a user click.
fn remove_dir_all_retry(dir: &Path) -> std::io::Result<()> {
    let mut delay = Duration::from_millis(10);
    for attempt in 0..10u32 {
        match std::fs::remove_dir_all(dir) {
            Ok(()) => return Ok(()),
            Err(e) if attempt < 9 && transient_lock(&e) => {
                std::thread::sleep(delay);
                delay = (delay * 2).min(Duration::from_millis(250));
            }
            Err(e) => return Err(e),
        }
    }
    unreachable!("the final iteration always returns")
}

/// Tolerate an already-absent target (idempotent double-delete).
fn remove_file_idempotent(path: &Path) -> AppResult<()> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}

fn halt_if_invalid(manifest: &Manifest, what: &str) -> AppResult<()> {
    let errs = validate::validate(manifest);
    if errs.is_empty() {
        Ok(())
    } else {
        Err(AppError::msg(format!(
            "{what} would corrupt the manifest: {}",
            errs.join("; ")
        )))
    }
}

// ---------------------------------------------------------------------------
// Subject deletion (the dir removal; session shutdown stays in engine_cmds).
// ---------------------------------------------------------------------------

/// Remove `learning/<slug>/` recursively. Idempotent (a missing dir is success).
/// Defense-in-depth: the target's parent MUST be the `learning/` dir.
pub fn delete_subject_dir(ws: &Path, slug: &str) -> AppResult<()> {
    validate_slug(slug)?;
    let dir = workspace::subject_dir(ws, slug);
    if dir.parent() != Some(workspace::learning_dir(ws).as_path()) {
        return Err(AppError::msg("refusing to delete outside the learning dir"));
    }
    match remove_dir_all_retry(&dir) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}

// ---------------------------------------------------------------------------
// Lesson deletion (+ re-open the named module so the next step re-teaches).
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteLessonResult {
    pub manifest: Manifest,
    /// Whether the `taught` flip actually armed a re-teach (false if the lesson
    /// could not be tied to a module).
    pub reopened: bool,
}

/// Delete one `lessons/<file>.md` and re-open its module (`taught=false`, repoint
/// `current.*` to re-teach THIS module) when `module_id` names a real module. The
/// UI passes the authoritative id resolved by [`list_lessons`]; we never re-parse
/// the filename's leading number to pick the module (it goes stale across a
/// curriculum rebuild). Mastery, assignments, and the review queue are untouched.
pub fn delete_lesson(
    ws: &Path,
    slug: &str,
    module_id: &str,
    file: &str,
    today: Date,
) -> AppResult<DeleteLessonResult> {
    validate_slug(slug)?;
    ensure_bare_filename(file)?;

    let path = workspace::manifest_path(ws, slug);
    let mut manifest = store::load(&path)?;
    let lesson_path = workspace::subject_dir(ws, slug).join("lessons").join(file);

    let mut reopened = false;
    if !module_id.is_empty() {
        if let Some(m) = manifest.modules.iter_mut().find(|m| m.id.0 == module_id) {
            m.taught = false; // the ONLY field that re-arms Route::Teach
            let mid = m.id.clone();
            if manifest.current.module_id.as_ref() != Some(&mid) {
                manifest.current.module_id = Some(mid);
                manifest.current.phase = Some(Phase::Teach);
                manifest.current.status = CurrentStatus::InProgress;
            }
            reopened = true;
        }
    }

    // Genuine no-op (no module matched AND the file is already gone): skip save so
    // we never bump `updated` and clobber a concurrent step over nothing.
    if !reopened && !lesson_path.exists() {
        return Ok(DeleteLessonResult { manifest, reopened });
    }

    halt_if_invalid(&manifest, "deleting this lesson")?;
    if reopened {
        store::save(&path, &mut manifest, today, &workspace::backup_stamp())?;
    }
    remove_file_idempotent(&lesson_path)?; // file last
    Ok(DeleteLessonResult { manifest, reopened })
}

// ---------------------------------------------------------------------------
// Assignment deletion (remove the manifest entry + the file; repair routing).
// ---------------------------------------------------------------------------

fn status_str(s: AssignmentStatus) -> &'static str {
    match s {
        AssignmentStatus::Open => "open",
        AssignmentStatus::Submitted => "submitted",
        AssignmentStatus::Graded => "graded",
    }
}

fn route_to_phase(route: &Route) -> Option<Phase> {
    match route {
        Route::Teach { .. } => Some(Phase::Teach),
        Route::CreateAssignment { .. } | Route::CompleteOpenAssignment { .. } => {
            Some(Phase::Assign)
        }
        Route::Assess { .. } => Some(Phase::Assess),
        Route::Capstone => Some(Phase::Capstone),
        Route::Research | Route::Placement | Route::BuildCurriculum | Route::CourseComplete => None,
    }
}

/// Delete an assignment by its (stable) id: drop the manifest entry, audit any
/// discarded submitted/graded work, realign `current.phase` to the freshly
/// derived route when it was the current module's assignment, then remove the
/// file. Never touches mastery or the review queue.
pub fn delete_assignment(
    ws: &Path,
    slug: &str,
    assignment_id: &str,
    today: Date,
) -> AppResult<Manifest> {
    validate_slug(slug)?;
    let path = workspace::manifest_path(ws, slug);
    let mut manifest = store::load(&path)?;

    let idx = match manifest
        .assignments
        .iter()
        .position(|a| a.id.0 == assignment_id)
    {
        Some(i) => i,
        None => return Ok(manifest), // idempotent — no save, no `updated` bump
    };
    let assignment = manifest.assignments[idx].clone();
    // Guard the manifest-authored file path FIRST (before any mutation).
    let file_path = contained_path(ws, slug, &assignment.file)?;

    manifest.assignments.remove(idx);

    if matches!(
        assignment.status,
        AssignmentStatus::Submitted | AssignmentStatus::Graded
    ) {
        manifest.history.push(HistoryEntry {
            date: today,
            skill: "app-delete".into(),
            event: format!(
                "deleted {} assignment {} for {}",
                status_str(assignment.status),
                assignment.id,
                assignment.module_id
            ),
            result: String::new(),
        });
    }

    // Routing repair: only when the deleted assignment was on the CURRENT,
    // non-mastered module. Re-derive the route and match the advisory phase to it.
    if manifest.current.module_id.as_ref() == Some(&assignment.module_id) {
        let on_mastered = manifest
            .modules
            .iter()
            .any(|m| m.id == assignment.module_id && m.status == ModuleStatus::Mastered);
        if !on_mastered {
            let disk = workspace::disk_state(ws, slug);
            if let Some(phase) = route_to_phase(&derive_route(&manifest, &disk).route) {
                manifest.current.phase = Some(phase);
                if !matches!(phase, Phase::Capstone) {
                    manifest.current.status = CurrentStatus::InProgress;
                }
            }
        }
    }

    halt_if_invalid(&manifest, "deleting this assignment")?;
    store::save(&path, &mut manifest, today, &workspace::backup_stamp())?;
    remove_file_idempotent(&file_path)?; // file last
    Ok(manifest)
}

// ---------------------------------------------------------------------------
// Curriculum reset (the one safe "redo a build step"): wipe modules + delete
// curriculum.json so the router re-routes to build-curriculum.
// ---------------------------------------------------------------------------

/// Reset the curriculum: clear modules + assignments, rewind `current.*`, preserve
/// the spaced-review schedule by UNLINKING items from the now-gone modules (keeps
/// box/due/lapses), clear a stale certification, then delete `curriculum.json`
/// LAST. This is the single sanctioned exception to the capstone single-writer
/// boundary, scoped to a full wipe only.
pub fn reset_curriculum(ws: &Path, slug: &str, today: Date) -> AppResult<Manifest> {
    validate_slug(slug)?;
    let path = workspace::manifest_path(ws, slug);
    let mut manifest = store::load(&path)?;

    manifest.modules.clear();
    manifest.assignments.clear();
    manifest.current.module_id = None;
    manifest.current.phase = None;
    manifest.current.level = match manifest.scale.start {
        ScaleStart::Level(n) => Some(n),
        ScaleStart::Test => None,
    };
    if manifest.current.status == CurrentStatus::Certified {
        // Clear status AND certification together (validate only checks the
        // forward direction, so a forgotten clear would leave a lying state).
        manifest.certification = None;
        manifest.current.status = CurrentStatus::InProgress;
    }
    for item in &mut manifest.review_queue {
        item.module_id = None; // keep the Leitner schedule, drop the dead link
    }

    halt_if_invalid(&manifest, "resetting the curriculum")?;
    store::save(&path, &mut manifest, today, &workspace::backup_stamp())?;
    remove_file_idempotent(&workspace::subject_dir(ws, slug).join("curriculum.json"))?;
    Ok(manifest)
}

// ---------------------------------------------------------------------------
// Lesson listing (sourced from the lessons/ dir — there is no lesson entity in
// the manifest — enriched best-effort with the authoritative module id).
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonEntry {
    pub file: String,
    pub module_id: Option<String>,
    pub module_status: Option<String>,
    pub title: Option<String>,
}

fn leading_number(file: &str) -> Option<u32> {
    let digits: String = file.chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse().ok()
}

/// List `lessons/*.md` (sorted), each enriched with the module it maps to (by the
/// `NN-` prefix → `ModuleId.suffix()`), so the UI can pass the authoritative id
/// back to [`delete_lesson`] and show the right re-teach warning. Missing dir → [].
pub fn list_lessons(ws: &Path, slug: &str) -> AppResult<Vec<LessonEntry>> {
    validate_slug(slug)?;
    let dir = workspace::subject_dir(ws, slug).join("lessons");
    let mut files: Vec<String> = match std::fs::read_dir(&dir) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .filter_map(|e| e.file_name().into_string().ok())
            .filter(|n| n.ends_with(".md"))
            .collect(),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e.into()),
    };
    files.sort();

    let manifest = store::load(&workspace::manifest_path(ws, slug)).ok();
    Ok(files
        .into_iter()
        .map(|file| {
            let module = manifest.as_ref().and_then(|m| {
                leading_number(&file)
                    .and_then(|n| m.modules.iter().find(|md| md.id.suffix() == Some(n)))
            });
            LessonEntry {
                module_id: module.map(|m| m.id.0.clone()),
                module_status: module.map(|m| m.status.as_str().to_string()),
                title: module.map(|m| m.title.clone()),
                file,
            }
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::{ensure_workspace, next_step, read_manifest, seed_demo};
    use lyceum_core::model::Certification; // CurrentStatus/Phase/etc. come via super::*
    use time::macros::date;

    const TODAY: Date = date!(2026 - 06 - 19);

    fn seeded() -> (tempfile::TempDir, String) {
        let tmp = tempfile::tempdir().unwrap();
        ensure_workspace(tmp.path()).unwrap();
        let slug = seed_demo(tmp.path(), date!(2026 - 06 - 18)).unwrap();
        (tmp, slug)
    }

    // --- slug + path guards ---------------------------------------------------

    #[test]
    fn validate_slug_rejects_traversal_and_empty() {
        for bad in ["", ".", "..", "a/b", "a\\b", "/etc", "C:foo", " x ", "A"] {
            assert!(validate_slug(bad).is_err(), "should reject {bad:?}");
        }
        assert!(validate_slug("conversational-spanish").is_ok());
    }

    #[test]
    fn contained_path_rejects_escapes() {
        let ws = Path::new("/ws");
        assert!(contained_path(ws, "s", "../../etc/passwd").is_err());
        assert!(contained_path(ws, "s", "/etc/passwd").is_err());
        assert!(contained_path(ws, "s", "").is_err());
        assert!(contained_path(ws, "s", "lessons/01-x.md").is_ok());
    }

    // --- subject --------------------------------------------------------------

    #[test]
    fn delete_subject_dir_removes_and_is_idempotent() {
        let (tmp, slug) = seeded();
        assert!(workspace::subject_dir(tmp.path(), &slug).is_dir());
        delete_subject_dir(tmp.path(), &slug).unwrap();
        assert!(!workspace::subject_dir(tmp.path(), &slug).exists());
        assert!(crate::workspace::list_slugs(tmp.path()).is_empty());
        // Double-delete + never-existed slug both succeed.
        delete_subject_dir(tmp.path(), &slug).unwrap();
        delete_subject_dir(tmp.path(), "never-existed").unwrap();
    }

    // --- lessons --------------------------------------------------------------

    fn write_lesson(tmp: &Path, slug: &str, name: &str) -> PathBuf {
        let p = workspace::subject_dir(tmp, slug).join("lessons").join(name);
        std::fs::write(&p, "# lesson\n").unwrap();
        p
    }

    #[test]
    fn delete_lesson_reopens_module_and_keeps_mastery() {
        let (tmp, slug) = seeded(); // m01 mastered, current=m02
        let lesson = write_lesson(tmp.path(), &slug, "01-m01-greetings.md");
        let before = read_manifest(tmp.path(), &slug).unwrap();
        let m01_mastery = before.modules[0].objectives[0].mastery;

        let res = delete_lesson(tmp.path(), &slug, "m01", "01-m01-greetings.md", TODAY).unwrap();
        assert!(res.reopened);
        assert!(!lesson.exists());

        let after = read_manifest(tmp.path(), &slug).unwrap();
        let m01 = after.modules.iter().find(|m| m.id.0 == "m01").unwrap();
        assert!(!m01.taught);
        assert_eq!(m01.objectives[0].mastery, m01_mastery, "mastery preserved");
        assert_eq!(after.current.module_id.as_ref().unwrap().0, "m01");
        assert_eq!(after.current.phase, Some(Phase::Teach));
        assert_eq!(after.current.status, CurrentStatus::InProgress);
        assert_eq!(
            after.assignments, before.assignments,
            "assignments untouched"
        );
        assert_eq!(after.review_queue, before.review_queue, "reviews untouched");
        assert!(validate::validate(&after).is_empty());
    }

    #[test]
    fn delete_lesson_uses_authoritative_id_not_filename_nn() {
        // The filename starts with "02" but the UI passes the authoritative "m01";
        // ONLY m01 may flip — proving no leading-NN re-parse drives the flip.
        let (tmp, slug) = seeded();
        write_lesson(tmp.path(), &slug, "02-m01-confusing.md");
        delete_lesson(tmp.path(), &slug, "m01", "02-m01-confusing.md", TODAY).unwrap();
        let after = read_manifest(tmp.path(), &slug).unwrap();
        assert!(
            !after
                .modules
                .iter()
                .find(|m| m.id.0 == "m01")
                .unwrap()
                .taught
        );
        assert!(
            after
                .modules
                .iter()
                .find(|m| m.id.0 == "m02")
                .unwrap()
                .taught,
            "m02 must NOT be touched by the leading 02"
        );
    }

    #[test]
    fn delete_lesson_unresolved_module_is_noop_without_save() {
        let (tmp, slug) = seeded();
        let before = read_manifest(tmp.path(), &slug).unwrap();
        // No module matches, and no file on disk -> pure no-op, no save.
        let res = delete_lesson(tmp.path(), &slug, "", "orphan.md", TODAY).unwrap();
        assert!(!res.reopened);
        let after = read_manifest(tmp.path(), &slug).unwrap();
        assert_eq!(after.updated, before.updated, "updated must NOT be bumped");
        assert_eq!(after.modules, before.modules);
    }

    #[test]
    fn delete_lesson_halts_before_deleting_file_on_invalid_manifest() {
        // Corrupt the manifest with a duplicate module id so validate fails. The
        // lesson file MUST survive (save-then-delete: no save => no delete).
        let (tmp, slug) = seeded();
        let path = workspace::manifest_path(tmp.path(), &slug);
        let mut m = read_manifest(tmp.path(), &slug).unwrap();
        let dup = m.modules[0].clone();
        m.modules.push(dup); // duplicate "m01"
        store::save(&path, &mut m, TODAY, "dup").unwrap();
        let lesson = write_lesson(tmp.path(), &slug, "01-m01-greetings.md");

        let err = delete_lesson(tmp.path(), &slug, "m01", "01-m01-greetings.md", TODAY);
        assert!(
            err.is_err(),
            "must HALT on an invalid post-mutation manifest"
        );
        assert!(lesson.exists(), "file must survive a HALT");
    }

    #[test]
    fn delete_lesson_rejects_bad_filename() {
        let (tmp, slug) = seeded();
        for bad in ["../x.md", "a/b.md", "/etc/passwd"] {
            assert!(delete_lesson(tmp.path(), &slug, "m01", bad, TODAY).is_err());
        }
    }

    // --- assignments ----------------------------------------------------------

    #[test]
    fn delete_assignment_on_current_module_repairs_route() {
        let (tmp, slug) = seeded(); // a02 OPEN on m02, current=m02
        let file = workspace::subject_dir(tmp.path(), &slug)
            .join("assignments")
            .join("02-m02-guided-practice.md");
        assert!(file.exists());
        let before = read_manifest(tmp.path(), &slug).unwrap();

        let after = delete_assignment(tmp.path(), &slug, "a02", TODAY).unwrap();
        assert!(after.assignments.is_empty());
        assert!(!file.exists());
        // m02 taught, no assignment, not mastered -> route CreateAssignment -> Assign.
        assert_eq!(after.current.phase, Some(Phase::Assign));
        assert_eq!(after.current.status, CurrentStatus::InProgress);
        assert_eq!(after.review_queue, before.review_queue, "reviews untouched");
        assert_eq!(after.modules, before.modules, "mastery/modules untouched");
        assert!(validate::validate(&after).is_empty());
        assert_eq!(
            next_step(tmp.path(), &slug).unwrap().kind,
            "createAssignment"
        );
    }

    #[test]
    fn delete_submitted_assignment_audits_history() {
        let (tmp, slug) = seeded();
        let path = workspace::manifest_path(tmp.path(), &slug);
        let mut m = read_manifest(tmp.path(), &slug).unwrap();
        m.assignments[0].status = AssignmentStatus::Submitted;
        store::save(&path, &mut m, TODAY, "sub").unwrap();

        let after = delete_assignment(tmp.path(), &slug, "a02", TODAY).unwrap();
        assert!(after
            .history
            .iter()
            .any(|h| h.skill == "app-delete" && h.event.contains("submitted assignment a02")));
    }

    #[test]
    fn delete_assignment_on_old_module_leaves_current_unchanged() {
        let (tmp, slug) = seeded();
        // Point current at the mastered m01; a02 is on m02 (not current).
        let path = workspace::manifest_path(tmp.path(), &slug);
        let mut m = read_manifest(tmp.path(), &slug).unwrap();
        m.current.module_id = Some("m01".into());
        m.current.phase = Some(Phase::Assess);
        store::save(&path, &mut m, TODAY, "cur").unwrap();

        let after = delete_assignment(tmp.path(), &slug, "a02", TODAY).unwrap();
        assert_eq!(after.current.module_id.as_ref().unwrap().0, "m01");
        assert_eq!(after.current.phase, Some(Phase::Assess), "phase unchanged");
        assert!(validate::validate(&after).is_empty());
    }

    #[test]
    fn delete_assignment_missing_id_is_noop_without_save() {
        let (tmp, slug) = seeded();
        let before = read_manifest(tmp.path(), &slug).unwrap();
        let after = delete_assignment(tmp.path(), &slug, "nope", TODAY).unwrap();
        assert_eq!(after.assignments, before.assignments);
        assert_eq!(after.updated, before.updated, "no save on a missing id");
    }

    #[test]
    fn delete_assignment_rejects_escaping_file() {
        let (tmp, slug) = seeded();
        let path = workspace::manifest_path(tmp.path(), &slug);
        let mut m = read_manifest(tmp.path(), &slug).unwrap();
        m.assignments[0].file = "../../etc/passwd".into();
        store::save(&path, &mut m, TODAY, "bad").unwrap();

        assert!(delete_assignment(tmp.path(), &slug, "a02", TODAY).is_err());
        // The entry must still be on disk (guard ran before any mutation persisted).
        let after = read_manifest(tmp.path(), &slug).unwrap();
        assert_eq!(after.assignments.len(), 1);
    }

    // --- curriculum reset -----------------------------------------------------

    #[test]
    fn reset_curriculum_wipes_modules_and_reroutes() {
        let (tmp, slug) = seeded();
        assert!(workspace::subject_dir(tmp.path(), &slug)
            .join("curriculum.json")
            .exists());
        let after = reset_curriculum(tmp.path(), &slug, TODAY).unwrap();
        assert!(after.modules.is_empty());
        assert!(after.assignments.is_empty());
        assert!(after.current.module_id.is_none());
        assert!(after.current.phase.is_none());
        assert!(!workspace::subject_dir(tmp.path(), &slug)
            .join("curriculum.json")
            .exists());
        assert!(validate::validate(&after).is_empty());
        assert_eq!(
            next_step(tmp.path(), &slug).unwrap().kind,
            "buildCurriculum"
        );
    }

    #[test]
    fn reset_curriculum_preserves_review_schedule_unlinked() {
        let (tmp, slug) = seeded(); // r001 box3, r002 box1, r003 box2 — all linked
        let after = reset_curriculum(tmp.path(), &slug, TODAY).unwrap();
        assert_eq!(after.review_queue.len(), 3, "reviews kept, not dropped");
        assert!(after.review_queue.iter().all(|r| r.module_id.is_none()));
        let r001 = after
            .review_queue
            .iter()
            .find(|r| r.item_id.0 == "r001")
            .unwrap();
        assert_eq!(r001.box_.number(), Some(3), "Leitner box preserved");
    }

    #[test]
    fn reset_curriculum_clears_stale_certification() {
        let (tmp, slug) = seeded();
        let path = workspace::manifest_path(tmp.path(), &slug);
        let mut m = read_manifest(tmp.path(), &slug).unwrap();
        m.current.status = CurrentStatus::Certified;
        m.certification = Some(Certification {
            certified: true,
            level: 2,
            date: TODAY,
            criteria: vec![],
            deliverable: String::new(),
            notes: String::new(),
        });
        store::save(&path, &mut m, TODAY, "cert").unwrap();

        let after = reset_curriculum(tmp.path(), &slug, TODAY).unwrap();
        assert_ne!(after.current.status, CurrentStatus::Certified);
        assert!(after.certification.is_none());
        assert!(validate::validate(&after).is_empty()); // no "certified but null"
    }

    // --- list_lessons ---------------------------------------------------------

    #[test]
    fn list_lessons_enriches_from_manifest() {
        let (tmp, slug) = seeded();
        write_lesson(tmp.path(), &slug, "03-m03-storytelling.md");
        write_lesson(tmp.path(), &slug, "01-m01-greetings.md");
        std::fs::write(
            workspace::subject_dir(tmp.path(), &slug)
                .join("lessons")
                .join("notes.txt"),
            "x",
        )
        .unwrap();

        let lessons = list_lessons(tmp.path(), &slug).unwrap();
        assert_eq!(lessons.len(), 2, "non-.md excluded");
        assert_eq!(lessons[0].file, "01-m01-greetings.md", "sorted");
        assert_eq!(lessons[0].module_id.as_deref(), Some("m01"));
        assert_eq!(
            lessons[0].title.as_deref(),
            Some("Sound system & greetings")
        );
        assert_eq!(lessons[1].module_id.as_deref(), Some("m03"));
        assert_eq!(lessons[1].module_status.as_deref(), Some("locked"));
    }

    #[test]
    fn list_lessons_missing_dir_is_empty() {
        let tmp = tempfile::tempdir().unwrap();
        ensure_workspace(tmp.path()).unwrap();
        // No subject at all -> empty (read_dir NotFound).
        assert!(list_lessons(tmp.path(), "ghost").unwrap().is_empty());
    }
}
