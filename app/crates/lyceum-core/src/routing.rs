//! The learn router — a deterministic mirror of the `learn` skill's first-match
//! decision (i)→(ix). Computed from disk state only (file presence + manifest),
//! never by parsing prose. Advisory in the UI; the authoritative mutation always
//! goes through Claude/the engine.

use crate::mastery::all_target_modules_mastered;
use crate::model::{
    AssignmentStatus, CurrentStatus, Manifest, Module, ModuleId, ModuleStatus, ObjectiveId,
    ScaleStart,
};

/// Which workspace files exist on disk (the Tauri layer stats these and fills it
/// in, keeping `lyceum-core` free of I/O for routing).
#[derive(Debug, Clone, Copy, Default)]
pub struct DiskState {
    pub has_research: bool,
    pub has_knowledge_map: bool,
    pub has_curriculum_json: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Route {
    Research,
    Placement,
    BuildCurriculum,
    Teach {
        module_id: ModuleId,
    },
    CreateAssignment {
        module_id: ModuleId,
    },
    /// A failed assessment: re-teach the weak objectives a different way, then re-drill.
    /// `weak_objectives` are the gate-failing ids (unscored or below threshold) so the
    /// skill — and the prompt — can target exactly what didn't land.
    Remediate {
        module_id: ModuleId,
        weak_objectives: Vec<ObjectiveId>,
    },
    CompleteOpenAssignment {
        assignment_id: crate::model::AssignmentId,
    },
    Assess {
        assignment_id: crate::model::AssignmentId,
    },
    Capstone,
    CourseComplete,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RouteDecision {
    pub route: Route,
    pub why: String,
}

fn decide(route: Route, why: &str) -> RouteDecision {
    RouteDecision {
        route,
        why: why.to_string(),
    }
}

/// Compute the next step. First match wins.
pub fn derive_route(manifest: &Manifest, disk: &DiskState) -> RouteDecision {
    // (i) no research yet.
    if !disk.has_research {
        return decide(Route::Research, "no research.md yet — research the subject");
    }

    // (ii) placement requested but not taken.
    let placement_pending = matches!(manifest.scale.start, ScaleStart::Test)
        && manifest
            .placement
            .as_ref()
            .map(|p| !p.taken)
            .unwrap_or(true);
    if placement_pending {
        return decide(
            Route::Placement,
            "scale.start is \"test\" and placement not taken",
        );
    }

    // (iii) no curriculum yet.
    if !disk.has_curriculum_json {
        return decide(
            Route::BuildCurriculum,
            "no curriculum.json yet — build the curriculum",
        );
    }

    // From here we need a current module.
    let current_id = match &manifest.current.module_id {
        Some(id) => id.clone(),
        None => {
            // Curriculum exists but no current module set — pick lowest level/id.
            match lowest_module(manifest) {
                Some(id) => id,
                None => {
                    return decide(
                        Route::BuildCurriculum,
                        "curriculum.json present but no modules",
                    )
                }
            }
        }
    };
    let current = manifest.modules.iter().find(|m| m.id == current_id);

    // (ix-as-guard) already certified.
    if manifest.current.status == CurrentStatus::Certified {
        return decide(
            Route::CourseComplete,
            "current.status is certified — course complete",
        );
    }

    if let Some(module) = current {
        // Assignments scoped to the CURRENT module (a stale submitted assignment on
        // an old module must never hijack routing).
        let open = manifest
            .assignments
            .iter()
            .find(|a| a.module_id == module.id && a.status == AssignmentStatus::Open);
        let submitted = manifest
            .assignments
            .iter()
            .filter(|a| a.module_id == module.id && a.status == AssignmentStatus::Submitted)
            .min_by_key(|a| a.id.suffix().unwrap_or(u32::MAX));

        // (iv) current module not taught yet (and nothing already pending on it).
        if !module.taught && open.is_none() && submitted.is_none() {
            return decide(
                Route::Teach {
                    module_id: module.id.clone(),
                },
                "current module not taught yet — deliver the lesson",
            );
        }

        // (vi) open assignment on current module — complete it.
        if let Some(a) = open {
            return decide(
                Route::CompleteOpenAssignment {
                    assignment_id: a.id.clone(),
                },
                "current module has an open assignment — complete it",
            );
        }

        // (vii) submitted assignment on current module — assess it.
        if let Some(a) = submitted {
            return decide(
                Route::Assess {
                    assignment_id: a.id.clone(),
                },
                "current module has a submitted assignment — assess it",
            );
        }

        // (v) taught, nothing pending, and NOT yet mastered.
        // A module already `mastered` falls through to the capstone/advance check below.
        if module.status != ModuleStatus::Mastered {
            // Has THIS module ever been assessed? (a graded assignment scoped to it — never
            // a stale graded assignment on an old module, mirroring the open/submitted scope.)
            let has_graded = manifest
                .assignments
                .iter()
                .any(|a| a.module_id == module.id && a.status == AssignmentStatus::Graded);
            let weak = gate_failing_objectives(module);
            // After a failed assessment (≥1 graded drill) with objectives still short of the
            // gate, RE-TEACH the weak objectives, then re-drill — instead of blindly
            // re-issuing the same assignment. A module with no graded drill yet (just taught)
            // takes the first-drill path; so does a degenerate 0-objective module (empty
            // `weak` ⇒ it keeps its pre-existing create-assignment behavior, never a new
            // remediation loop).
            if has_graded && !weak.is_empty() {
                return decide(
                    Route::Remediate {
                        module_id: module.id.clone(),
                        weak_objectives: weak,
                    },
                    "the last check left a few objectives short — revisit them, then practice again",
                );
            }
            return decide(
                Route::CreateAssignment {
                    module_id: module.id.clone(),
                },
                "module taught with no pending assignment — create one",
            );
        }
    }

    // (viii) all target modules mastered -> capstone (unless certified, handled above).
    if all_target_modules_mastered(manifest) {
        return decide(
            Route::Capstone,
            "all modules through target mastered — run the capstone",
        );
    }

    // Fallback: re-teach the current module.
    decide(
        Route::Teach {
            module_id: current_id,
        },
        "default — continue teaching the current module",
    )
}

/// Objectives short of the module's mastery gate: unscored (`mastery == None`) or below
/// `mastery_threshold`. This mirrors `mastery::module_clears_gate` (which fails the gate on
/// any `None` or sub-threshold score), so a **non-empty** result is equivalent to "the module
/// has objectives AND does not clear the gate" — the exact condition for remediation.
pub fn gate_failing_objectives(module: &Module) -> Vec<ObjectiveId> {
    module
        .objectives
        .iter()
        .filter(|o| {
            o.mastery
                .map(|m| m < module.mastery_threshold)
                .unwrap_or(true)
        })
        .map(|o| o.id.clone())
        .collect()
}

fn lowest_module(manifest: &Manifest) -> Option<ModuleId> {
    manifest
        .modules
        .iter()
        .min_by(|a, b| {
            a.level
                .cmp(&b.level)
                .then(a.id.suffix().cmp(&b.id.suffix()))
        })
        .map(|m| m.id.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::*;
    use crate::test_support::{base_manifest, manifest_with_modules, module};

    fn full_disk() -> DiskState {
        DiskState {
            has_research: true,
            has_knowledge_map: true,
            has_curriculum_json: true,
        }
    }

    #[test]
    fn no_research_routes_to_research() {
        let m = base_manifest();
        let r = derive_route(&m, &DiskState::default());
        assert_eq!(r.route, Route::Research);
    }

    #[test]
    fn test_sentinel_routes_to_placement() {
        let mut m = base_manifest();
        m.scale.start = ScaleStart::Test;
        let disk = DiskState {
            has_research: true,
            ..Default::default()
        };
        assert_eq!(derive_route(&m, &disk).route, Route::Placement);
    }

    #[test]
    fn no_curriculum_routes_to_build() {
        let mut m = base_manifest();
        m.scale.start = ScaleStart::Level(2);
        let disk = DiskState {
            has_research: true,
            has_knowledge_map: true,
            has_curriculum_json: false,
        };
        assert_eq!(derive_route(&m, &disk).route, Route::BuildCurriculum);
    }

    #[test]
    fn untaught_current_module_routes_to_teach() {
        let m1 = module("m01", 1, &[], ModuleStatus::InProgress); // taught=false
        let mut man = manifest_with_modules(vec![m1]);
        man.current.module_id = Some(ModuleId("m01".into()));
        assert_eq!(
            derive_route(&man, &full_disk()).route,
            Route::Teach {
                module_id: ModuleId("m01".into())
            }
        );
    }

    #[test]
    fn taught_no_assignment_routes_to_create_assignment() {
        let mut m1 = module("m01", 1, &[], ModuleStatus::InProgress);
        m1.taught = true;
        let mut man = manifest_with_modules(vec![m1]);
        man.current.module_id = Some(ModuleId("m01".into()));
        assert_eq!(
            derive_route(&man, &full_disk()).route,
            Route::CreateAssignment {
                module_id: ModuleId("m01".into())
            }
        );
    }

    #[test]
    fn submitted_assignment_routes_to_assess() {
        let mut m1 = module("m01", 1, &[], ModuleStatus::InProgress);
        m1.taught = true;
        let mut man = manifest_with_modules(vec![m1]);
        man.current.module_id = Some(ModuleId("m01".into()));
        man.assignments = vec![Assignment {
            id: AssignmentId("a01".into()),
            module_id: ModuleId("m01".into()),
            kind: "short".into(),
            file: "assignments/01.md".into(),
            objectives: vec![],
            status: AssignmentStatus::Submitted,
            input_type: None,
            options: vec![],
            language: None,
            submission_file: None,
            submitted_at: None,
            extra: Default::default(),
        }];
        assert_eq!(
            derive_route(&man, &full_disk()).route,
            Route::Assess {
                assignment_id: AssignmentId("a01".into())
            }
        );
    }

    #[test]
    fn stale_submitted_on_old_module_does_not_hijack_routing() {
        // RED-TEAM: a submitted assignment on m01 must NOT hijack routing when the
        // learner has advanced to m02 (current module).
        let mut m1 = module("m01", 1, &[], ModuleStatus::Mastered);
        m1.taught = true;
        let mut m2 = module("m02", 2, &["m01"], ModuleStatus::InProgress);
        m2.taught = true;
        let mut man = manifest_with_modules(vec![m1, m2]);
        man.current.module_id = Some(ModuleId("m02".into()));
        man.assignments = vec![Assignment {
            id: AssignmentId("a01".into()),
            module_id: ModuleId("m01".into()), // OLD module
            kind: "short".into(),
            file: "assignments/01.md".into(),
            objectives: vec![],
            status: AssignmentStatus::Submitted,
            input_type: None,
            options: vec![],
            language: None,
            submission_file: None,
            submitted_at: None,
            extra: Default::default(),
        }];
        // Should route to CreateAssignment for m02, NOT Assess(a01).
        assert_eq!(
            derive_route(&man, &full_disk()).route,
            Route::CreateAssignment {
                module_id: ModuleId("m02".into())
            }
        );
    }

    #[test]
    fn all_mastered_routes_to_capstone() {
        let mut m1 = module("m01", 1, &[], ModuleStatus::Mastered);
        m1.taught = true;
        let mut man = manifest_with_modules(vec![m1]);
        man.scale.target = 1;
        man.current.module_id = Some(ModuleId("m01".into()));
        man.current.status = CurrentStatus::Capstone;
        assert_eq!(derive_route(&man, &full_disk()).route, Route::Capstone);
    }

    #[test]
    fn certified_routes_to_course_complete() {
        let mut m1 = module("m01", 1, &[], ModuleStatus::Mastered);
        m1.taught = true;
        let mut man = manifest_with_modules(vec![m1]);
        man.current.module_id = Some(ModuleId("m01".into()));
        man.current.status = CurrentStatus::Certified;
        assert_eq!(
            derive_route(&man, &full_disk()).route,
            Route::CourseComplete
        );
    }

    // --- remediation -------------------------------------------------------

    fn obj(id: &str, mastery: Option<f64>) -> Objective {
        Objective {
            id: ObjectiveId(id.into()),
            text: "objective".into(),
            bloom: None,
            mastery,
            attempts: mastery.map(|_| 1),
            last_assessed: None,
        }
    }

    fn graded(id: &str, module_id: &str) -> Assignment {
        Assignment {
            id: AssignmentId(id.into()),
            module_id: ModuleId(module_id.into()),
            kind: "drill".into(),
            file: format!("assignments/{id}.md"),
            objectives: vec![],
            status: AssignmentStatus::Graded,
            input_type: None,
            options: vec![],
            language: None,
            submission_file: None,
            submitted_at: None,
            extra: Default::default(),
        }
    }

    /// A taught module whose graded drill left an objective short of the gate routes to
    /// Remediate, carrying exactly the failing objective(s) — not back to CreateAssignment.
    #[test]
    fn failed_assessment_routes_to_remediate() {
        let mut m1 = module("m01", 1, &[], ModuleStatus::InProgress);
        m1.taught = true;
        m1.objectives = vec![obj("m01-o1", Some(0.50)), obj("m01-o2", Some(0.95))];
        let mut man = manifest_with_modules(vec![m1]);
        man.current.module_id = Some(ModuleId("m01".into()));
        man.assignments = vec![graded("a01", "m01")];
        assert_eq!(
            derive_route(&man, &full_disk()).route,
            Route::Remediate {
                module_id: ModuleId("m01".into()),
                weak_objectives: vec![ObjectiveId("m01-o1".into())], // o2 cleared, excluded
            }
        );
    }

    /// First drill: a taught module with objectives but NO graded assignment yet still routes
    /// to CreateAssignment (remediation only kicks in AFTER a failed assessment).
    #[test]
    fn taught_with_objectives_but_no_graded_routes_to_create_assignment() {
        let mut m1 = module("m01", 1, &[], ModuleStatus::InProgress);
        m1.taught = true;
        m1.objectives = vec![obj("m01-o1", None)];
        let mut man = manifest_with_modules(vec![m1]);
        man.current.module_id = Some(ModuleId("m01".into()));
        assert_eq!(
            derive_route(&man, &full_disk()).route,
            Route::CreateAssignment {
                module_id: ModuleId("m01".into())
            }
        );
    }

    /// Assess-drift guard: a graded module whose objectives all clear the gate but whose
    /// `status` was not flipped to mastered must NOT remediate (empty weak set).
    #[test]
    fn graded_but_gate_clears_does_not_remediate() {
        let mut m1 = module("m01", 1, &[], ModuleStatus::InProgress);
        m1.taught = true;
        m1.objectives = vec![obj("m01-o1", Some(0.95))]; // ≥ 0.90 threshold
        let mut man = manifest_with_modules(vec![m1]);
        man.current.module_id = Some(ModuleId("m01".into()));
        man.assignments = vec![graded("a01", "m01")];
        assert_eq!(
            derive_route(&man, &full_disk()).route,
            Route::CreateAssignment {
                module_id: ModuleId("m01".into())
            }
        );
    }

    /// B1 boundary: a degenerate 0-objective module (can never clear or fail the gate) keeps
    /// its pre-existing CreateAssignment behavior — it must NOT enter a remediation loop.
    #[test]
    fn zero_objective_module_does_not_remediate() {
        let mut m1 = module("m01", 1, &[], ModuleStatus::InProgress); // module() => no objectives
        m1.taught = true;
        let mut man = manifest_with_modules(vec![m1]);
        man.current.module_id = Some(ModuleId("m01".into()));
        man.assignments = vec![graded("a01", "m01")];
        assert_eq!(
            derive_route(&man, &full_disk()).route,
            Route::CreateAssignment {
                module_id: ModuleId("m01".into())
            }
        );
    }

    /// M4 scope: a graded assignment on an OLD (mastered) module must not make the CURRENT
    /// freshly-taught module remediate on its first pass.
    #[test]
    fn graded_on_other_module_does_not_trigger_remediate() {
        let mut m1 = module("m01", 1, &[], ModuleStatus::Mastered);
        m1.taught = true;
        m1.objectives = vec![obj("m01-o1", Some(0.95))];
        let mut m2 = module("m02", 2, &["m01"], ModuleStatus::InProgress);
        m2.taught = true;
        m2.objectives = vec![obj("m02-o1", None)];
        let mut man = manifest_with_modules(vec![m1, m2]);
        man.current.module_id = Some(ModuleId("m02".into()));
        man.assignments = vec![graded("a01", "m01")]; // graded on m01, not m02
        assert_eq!(
            derive_route(&man, &full_disk()).route,
            Route::CreateAssignment {
                module_id: ModuleId("m02".into())
            }
        );
    }

    /// Loop-safety at the routing layer: once remediation has emitted a new Open drill, the
    /// route is CompleteOpenAssignment — it can never re-enter Remediate without a fresh fail.
    #[test]
    fn open_drill_after_remediation_routes_to_complete_not_remediate() {
        let mut m1 = module("m01", 1, &[], ModuleStatus::InProgress);
        m1.taught = true;
        m1.objectives = vec![obj("m01-o1", Some(0.50))];
        let mut man = manifest_with_modules(vec![m1]);
        man.current.module_id = Some(ModuleId("m01".into()));
        let mut open = graded("a02", "m01");
        open.status = AssignmentStatus::Open;
        man.assignments = vec![graded("a01", "m01"), open];
        assert_eq!(
            derive_route(&man, &full_disk()).route,
            Route::CompleteOpenAssignment {
                assignment_id: AssignmentId("a02".into())
            }
        );
    }

    #[test]
    fn gate_failing_objectives_picks_unscored_and_below_threshold() {
        let mut m1 = module("m01", 1, &[], ModuleStatus::InProgress); // threshold 0.90
        m1.objectives = vec![
            obj("m01-o1", Some(0.95)), // clears
            obj("m01-o2", Some(0.40)), // below
            obj("m01-o3", None),       // unscored
        ];
        assert_eq!(
            gate_failing_objectives(&m1),
            vec![ObjectiveId("m01-o2".into()), ObjectiveId("m01-o3".into())]
        );
        let empty = module("m09", 1, &[], ModuleStatus::InProgress);
        assert!(gate_failing_objectives(&empty).is_empty());
    }
}
