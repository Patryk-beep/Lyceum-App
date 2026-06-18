//! Mastery gating + the read-only availability projection.
//!
//! `module.status` is **Claude's** to write (assess unlocks dependents). The app
//! only *projects* availability for display — it never writes locked->available.

use crate::model::{Manifest, Module, ModuleId, ModuleStatus};

/// Default mastery threshold per level: L1/L2 -> 0.90, L3+ -> 0.85 (rubric-referenced).
pub fn default_threshold(level: u8) -> f64 {
    if level <= 2 {
        0.90
    } else {
        0.85
    }
}

/// Map a rubric band name to an approximate mastery value (LEVELS.md §thresholds).
pub fn band_to_mastery(band: &str) -> Option<f64> {
    match band.to_ascii_lowercase().as_str() {
        "advanced" => Some(1.0),
        "proficient" => Some(0.85),
        "developing" => Some(0.65),
        "beginning" => Some(0.40),
        _ => None,
    }
}

/// True iff every objective of the module is at or above the module's threshold.
/// A module with no scored objectives does NOT clear the gate.
pub fn module_clears_gate(module: &Module) -> bool {
    if module.objectives.is_empty() {
        return false;
    }
    module.objectives.iter().all(|o| {
        o.mastery
            .map(|m| m >= module.mastery_threshold)
            .unwrap_or(false)
    })
}

/// Read-only availability projection: a module is *available* once all its
/// prereqs are `mastered`. Returns the projected status for display only —
/// callers must NOT write this back to disk (Claude owns `module.status`).
///
/// A module already `mastered` or `in-progress` keeps that status; otherwise it
/// is `available` if prereqs are met, else `locked`.
pub fn projected_status(manifest: &Manifest, module: &Module) -> ModuleStatus {
    match module.status {
        ModuleStatus::Mastered => ModuleStatus::Mastered,
        ModuleStatus::InProgress => ModuleStatus::InProgress,
        _ => {
            if prereqs_met(manifest, &module.prereqs) {
                ModuleStatus::Available
            } else {
                ModuleStatus::Locked
            }
        }
    }
}

fn prereqs_met(manifest: &Manifest, prereqs: &[ModuleId]) -> bool {
    prereqs.iter().all(|pid| {
        manifest
            .modules
            .iter()
            .find(|m| &m.id == pid)
            .map(|m| m.status == ModuleStatus::Mastered)
            .unwrap_or(false)
    })
}

/// Are all modules at or below `scale.target` mastered? (Gate into capstone.)
pub fn all_target_modules_mastered(manifest: &Manifest) -> bool {
    let relevant: Vec<&Module> = manifest
        .modules
        .iter()
        .filter(|m| m.level <= manifest.scale.target)
        .collect();
    !relevant.is_empty() && relevant.iter().all(|m| m.status == ModuleStatus::Mastered)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::*;
    use crate::test_support::{manifest_with_modules, module};

    #[test]
    fn thresholds_by_level() {
        assert_eq!(default_threshold(1), 0.90);
        assert_eq!(default_threshold(2), 0.90);
        assert_eq!(default_threshold(3), 0.85);
        assert_eq!(default_threshold(6), 0.85);
    }

    #[test]
    fn bands_map() {
        assert_eq!(band_to_mastery("Proficient"), Some(0.85));
        assert_eq!(band_to_mastery("advanced"), Some(1.0));
        assert!(band_to_mastery("nonsense").is_none());
    }

    #[test]
    fn gate_requires_all_objectives_at_threshold() {
        let mut m = module("m01", 1, &[], ModuleStatus::InProgress);
        m.mastery_threshold = 0.90;
        m.objectives = vec![
            Objective {
                id: ObjectiveId("m01-o1".into()),
                text: "x".into(),
                bloom: None,
                mastery: Some(0.92),
                attempts: Some(1),
                last_assessed: None,
            },
            Objective {
                id: ObjectiveId("m01-o2".into()),
                text: "y".into(),
                bloom: None,
                mastery: Some(0.88),
                attempts: Some(1),
                last_assessed: None,
            },
        ];
        assert!(!module_clears_gate(&m)); // o2 below 0.90
        m.objectives[1].mastery = Some(0.91);
        assert!(module_clears_gate(&m));
    }

    #[test]
    fn availability_follows_prereq_mastery() {
        let m1 = module("m01", 1, &[], ModuleStatus::Mastered);
        let m2 = module("m02", 2, &["m01"], ModuleStatus::Locked);
        let manifest = manifest_with_modules(vec![m1, m2.clone()]);
        assert_eq!(projected_status(&manifest, &m2), ModuleStatus::Available);

        let m1_locked = module("m01", 1, &[], ModuleStatus::Available);
        let m2b = module("m02", 2, &["m01"], ModuleStatus::Locked);
        let manifest2 = manifest_with_modules(vec![m1_locked, m2b.clone()]);
        assert_eq!(projected_status(&manifest2, &m2b), ModuleStatus::Locked);
    }
}
