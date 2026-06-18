//! The reload-validator + single-writer check.
//!
//! After every Claude turn the app re-reads the manifest and runs [`validate`]. It
//! REJECTS impossible states a mis-loaded (or buggy) headless session could write —
//! the real defense if the skills ever fail to load. On violation the app HALTs the
//! step rather than propagating corruption. [`single_writer_violations`] separately
//! catches a non-assess/review turn that raised mastery.

use std::collections::HashSet;

use crate::model::{CurrentStatus, Manifest, ModuleStatus};

/// Validate a manifest against the structural invariants of the contract.
/// Returns every violation found (empty = valid).
pub fn validate(manifest: &Manifest) -> Vec<String> {
    let mut errors = Vec::new();

    // 1. Unique ids.
    check_unique(
        manifest.modules.iter().map(|m| m.id.0.as_str()),
        "module",
        &mut errors,
    );
    check_unique(
        manifest.assignments.iter().map(|a| a.id.0.as_str()),
        "assignment",
        &mut errors,
    );
    check_unique(
        manifest.review_queue.iter().map(|r| r.item_id.0.as_str()),
        "review item",
        &mut errors,
    );

    let mastered: HashSet<&str> = manifest
        .modules
        .iter()
        .filter(|m| m.status == ModuleStatus::Mastered)
        .map(|m| m.id.0.as_str())
        .collect();
    let module_ids: HashSet<&str> = manifest.modules.iter().map(|m| m.id.0.as_str()).collect();

    for m in &manifest.modules {
        // 2. A mastered module must have every objective at/above threshold.
        if m.status == ModuleStatus::Mastered {
            if m.objectives.is_empty() {
                errors.push(format!("module {} is mastered but has no objectives", m.id));
            }
            for o in &m.objectives {
                match o.mastery {
                    Some(v) if v >= m.mastery_threshold => {}
                    Some(v) => errors.push(format!(
                        "module {} mastered but objective {} mastery {:.2} < threshold {:.2}",
                        m.id, o.id, v, m.mastery_threshold
                    )),
                    None => errors.push(format!(
                        "module {} mastered but objective {} is unassessed",
                        m.id, o.id
                    )),
                }
            }
        }

        // 3. Prereqs must reference real modules.
        for p in &m.prereqs {
            if !module_ids.contains(p.0.as_str()) {
                errors.push(format!("module {} references unknown prereq {}", m.id, p));
            }
        }

        // 4. An available/in-progress/mastered module must have all prereqs mastered.
        if matches!(
            m.status,
            ModuleStatus::Available | ModuleStatus::InProgress | ModuleStatus::Mastered
        ) {
            for p in &m.prereqs {
                if !mastered.contains(p.0.as_str()) {
                    errors.push(format!(
                        "module {} is {} but prereq {} is not mastered",
                        m.id,
                        m.status.as_str(),
                        p
                    ));
                }
            }
        }
    }

    // 5. Certified requires a certification record.
    if manifest.current.status == CurrentStatus::Certified && manifest.certification.is_none() {
        errors.push("current.status is certified but certification is null".to_string());
    }

    // 6. Assignment moduleIds must reference real modules.
    for a in &manifest.assignments {
        if !module_ids.contains(a.module_id.0.as_str()) {
            errors.push(format!(
                "assignment {} references unknown module {}",
                a.id, a.module_id
            ));
        }
    }

    errors
}

fn check_unique<'a>(ids: impl Iterator<Item = &'a str>, label: &str, errors: &mut Vec<String>) {
    let mut seen = HashSet::new();
    for id in ids {
        if !seen.insert(id) {
            errors.push(format!("duplicate {label} id: {id}"));
        }
    }
}

/// Single-writer-for-mastery check: returns the objectives whose mastery was RAISED
/// between `before` and `after`. The orchestrator calls this after a turn that is
/// NOT assess/review and treats any result as a contract breach (dev-assert).
pub fn raised_mastery(before: &Manifest, after: &Manifest) -> Vec<String> {
    let mut raised = Vec::new();
    for am in &after.modules {
        let bm = before.modules.iter().find(|m| m.id == am.id);
        for ao in &am.objectives {
            let before_val = bm
                .and_then(|m| m.objectives.iter().find(|o| o.id == ao.id))
                .and_then(|o| o.mastery)
                .unwrap_or(0.0);
            let after_val = ao.mastery.unwrap_or(0.0);
            if after_val > before_val + f64::EPSILON {
                raised.push(format!(
                    "{} mastery {:.2} -> {:.2}",
                    ao.id, before_val, after_val
                ));
            }
        }
        // A module flipped to mastered also counts as a mastery write.
        let was_mastered = bm
            .map(|m| m.status == ModuleStatus::Mastered)
            .unwrap_or(false);
        if am.status == ModuleStatus::Mastered && !was_mastered {
            raised.push(format!("{} flipped to mastered", am.id));
        }
    }
    raised
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::*;
    use crate::test_support::{golden_manifest, manifest_with_modules, module};

    #[test]
    fn golden_manifest_is_valid() {
        assert!(validate(&golden_manifest()).is_empty());
    }

    #[test]
    fn mastered_module_with_low_objective_is_rejected() {
        let mut m = module("m01", 1, &[], ModuleStatus::Mastered);
        m.objectives = vec![Objective {
            id: ObjectiveId("m01-o1".into()),
            text: "x".into(),
            bloom: None,
            mastery: Some(0.50),
            attempts: Some(1),
            last_assessed: None,
        }];
        let manifest = manifest_with_modules(vec![m]);
        let errs = validate(&manifest);
        assert!(errs.iter().any(|e| e.contains("< threshold")), "{errs:?}");
    }

    #[test]
    fn available_with_unmastered_prereq_is_rejected() {
        let m1 = module("m01", 1, &[], ModuleStatus::Available); // not mastered
        let m2 = module("m02", 2, &["m01"], ModuleStatus::Available);
        let manifest = manifest_with_modules(vec![m1, m2]);
        let errs = validate(&manifest);
        assert!(
            errs.iter()
                .any(|e| e.contains("prereq m01 is not mastered")),
            "{errs:?}"
        );
    }

    #[test]
    fn certified_without_certification_is_rejected() {
        let mut m = manifest_with_modules(vec![]);
        m.current.status = CurrentStatus::Certified;
        assert!(validate(&m)
            .iter()
            .any(|e| e.contains("certification is null")));
    }

    #[test]
    fn duplicate_ids_are_rejected() {
        let manifest = manifest_with_modules(vec![
            module("m01", 1, &[], ModuleStatus::Available),
            module("m01", 1, &[], ModuleStatus::Available),
        ]);
        assert!(validate(&manifest)
            .iter()
            .any(|e| e.contains("duplicate module id")));
    }

    #[test]
    fn raised_mastery_detects_a_mastery_write() {
        let before = golden_manifest();
        let mut after = before.clone();
        // raise m02-o1
        after.modules[1].objectives[0].mastery = Some(0.95);
        let raised = raised_mastery(&before, &after);
        assert!(raised.iter().any(|r| r.contains("m02-o1")), "{raised:?}");
    }

    #[test]
    fn raised_mastery_ignores_schedule_only_changes() {
        let before = golden_manifest();
        let mut after = before.clone();
        // a pure review-queue change must NOT look like a mastery write
        after.review_queue[0].box_ = Box_::N(4);
        assert!(raised_mastery(&before, &after).is_empty());
    }
}
