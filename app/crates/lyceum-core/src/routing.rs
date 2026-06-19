//! The learn router — a deterministic mirror of the `learn` skill's first-match
//! decision (i)→(ix). Computed from disk state only (file presence + manifest),
//! never by parsing prose. Advisory in the UI; the authoritative mutation always
//! goes through Claude/the engine.

use crate::mastery::all_target_modules_mastered;
use crate::model::{AssignmentStatus, CurrentStatus, Manifest, ModuleId, ModuleStatus, ScaleStart};

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

        // (v) taught, nothing pending, and NOT yet mastered — create an assignment.
        // A module already `mastered` falls through to the capstone/advance check
        // below (we never create an assignment for a mastered module).
        if module.status != ModuleStatus::Mastered {
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
}
