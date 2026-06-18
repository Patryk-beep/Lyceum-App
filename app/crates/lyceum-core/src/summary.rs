//! Per-subject summary for the Dashboard's StatGrid + SubjectCards. Computed in
//! the pure core (and unit-tested) so the frontend never derives mastery numbers.

use serde::Serialize;
use time::Date;

use crate::model::{Manifest, ModuleStatus};
use crate::routing::{derive_route, DiskState};
use crate::srs::due_count;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectSummary {
    pub slug: String,
    pub subject: String,
    pub level: u8,
    pub target: u8,
    pub status: String,
    pub phase: String,
    pub modules_total: usize,
    pub modules_mastered: usize,
    /// Mean of each module's mean-objective-mastery, over modules that have been
    /// assessed at all. `None` if nothing has been assessed yet.
    pub mean_mastery: Option<f64>,
    pub reviews_due: usize,
    pub next_action: String,
    pub updated: String,
}

/// Build the summary for one subject. `disk` reflects which workspace files exist;
/// `today` drives the due-count.
pub fn subject_summary(manifest: &Manifest, disk: &DiskState, today: Date) -> SubjectSummary {
    let modules_total = manifest.modules.len();
    let modules_mastered = manifest
        .modules
        .iter()
        .filter(|m| m.status == ModuleStatus::Mastered)
        .count();

    let module_means: Vec<f64> = manifest
        .modules
        .iter()
        .filter_map(|m| manifest.module_mean_mastery(m))
        .collect();
    let mean_mastery = if module_means.is_empty() {
        None
    } else {
        Some(module_means.iter().sum::<f64>() / module_means.len() as f64)
    };

    let route = derive_route(manifest, disk);

    SubjectSummary {
        slug: manifest.slug.clone(),
        subject: manifest.subject.clone(),
        level: manifest.current.level,
        target: manifest.scale.target,
        status: manifest.current.status.as_str().to_string(),
        phase: manifest.current.phase.as_str().to_string(),
        modules_total,
        modules_mastered,
        mean_mastery,
        reviews_due: due_count(&manifest.review_queue, today),
        next_action: route.why,
        updated: crate::date::format_iso(manifest.updated),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::golden_manifest;
    use time::macros::date;

    fn full_disk() -> DiskState {
        DiskState {
            has_research: true,
            has_knowledge_map: true,
            has_curriculum_json: true,
        }
    }

    #[test]
    fn golden_summary_matches_hand_computed_values() {
        let m = golden_manifest();
        let s = subject_summary(&m, &full_disk(), date!(2026 - 06 - 18));

        assert_eq!(s.slug, "conversational-spanish");
        assert_eq!(s.subject, "Conversational Spanish");
        assert_eq!(s.level, 2);
        assert_eq!(s.target, 4);
        assert_eq!(s.status, "in-progress");
        assert_eq!(s.phase, "assign");
        assert_eq!(s.modules_total, 3);
        assert_eq!(s.modules_mastered, 1); // only m01

        // module means: m01 = (0.92+0.90)/2 = 0.91; m02 = 0.62; m03 = none.
        // overall mean over assessed modules = (0.91 + 0.62) / 2 = 0.765.
        let mm = s.mean_mastery.unwrap();
        assert!((mm - 0.765).abs() < 1e-9, "mean_mastery was {mm}");

        // reviews due 2026-06-18: r001 (due 06-18), r002 (06-18), r003 (06-17) = 3.
        assert_eq!(s.reviews_due, 3);

        // current module m02 has an open assignment a02 -> complete it.
        assert!(
            s.next_action.contains("open assignment"),
            "{}",
            s.next_action
        );
        assert_eq!(s.updated, "2026-06-18");
    }

    #[test]
    fn committed_golden_fixture_matches_the_model() {
        // The fixture the frontend + Tauri layer load must stay in lockstep with
        // `golden_manifest()`. Regenerate with:
        //   cargo run -p lyceum-core --features fixtures --example gen_golden \
        //     > app/tests/fixtures/manifests/golden.json
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../tests/fixtures/manifests/golden.json"
        );
        let bytes = std::fs::read(path).expect("golden.json fixture exists");
        let from_file: Manifest = serde_json::from_slice(&bytes).expect("fixture parses");
        assert_eq!(
            from_file,
            golden_manifest(),
            "golden.json drifted from golden_manifest(); regenerate the fixture"
        );
    }
}
