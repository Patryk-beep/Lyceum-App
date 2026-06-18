//! Id allocation: always `(max existing numeric suffix) + 1`, never reuse.
//! Widths: modules/assignments 2, reviews 3, objectives unpadded.

use crate::model::{
    trailing_number, Assignment, AssignmentId, Module, ModuleId, Objective, ObjectiveId, ReviewId,
    ReviewItem,
};

fn max_suffix<T, F>(items: &[T], f: F) -> u32
where
    F: Fn(&T) -> Option<u32>,
{
    items.iter().filter_map(f).max().unwrap_or(0)
}

/// Next module id, e.g. `m01`, `m02`, … (empty -> `m01`).
pub fn next_module_id(modules: &[Module]) -> ModuleId {
    let n = max_suffix(modules, |m| m.id.suffix()) + 1;
    ModuleId(format!("m{n:02}"))
}

/// Next assignment id, e.g. `a01`, … (empty -> `a01`).
pub fn next_assignment_id(assignments: &[Assignment]) -> AssignmentId {
    let n = max_suffix(assignments, |a| a.id.suffix()) + 1;
    AssignmentId(format!("a{n:02}"))
}

/// Next review id, e.g. `r001`, … (empty -> `r001`).
pub fn next_review_id(queue: &[ReviewItem]) -> ReviewId {
    let n = max_suffix(queue, |r| r.item_id.suffix()) + 1;
    ReviewId(format!("r{n:03}"))
}

/// Next objective id for a module, e.g. `m03-o1`, `m03-o2`, … (unpadded).
pub fn next_objective_id(module_id: &ModuleId, objectives: &[Objective]) -> ObjectiveId {
    let n = max_suffix(objectives, |o| trailing_number(&o.id.0)) + 1;
    ObjectiveId(format!("{module_id}-o{n}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn module(id: &str) -> Module {
        Module {
            id: ModuleId(id.into()),
            title: "t".into(),
            level: 1,
            prereqs: vec![],
            status: crate::model::ModuleStatus::Available,
            taught: false,
            mastery_threshold: 0.9,
            objectives: vec![],
            extra: Default::default(),
        }
    }

    #[test]
    fn empty_collections_start_at_one() {
        assert_eq!(next_module_id(&[]).0, "m01");
        assert_eq!(next_assignment_id(&[]).0, "a01");
        assert_eq!(next_review_id(&[]).0, "r001");
    }

    #[test]
    fn max_plus_one_with_gaps() {
        let mods = vec![module("m01"), module("m05"), module("m03")];
        assert_eq!(next_module_id(&mods).0, "m06");
    }

    #[test]
    fn objective_ids_are_unpadded_and_module_scoped() {
        let mid = ModuleId("m03".into());
        let objs = vec![Objective {
            id: ObjectiveId("m03-o2".into()),
            text: "x".into(),
            bloom: None,
            mastery: None,
            attempts: None,
            last_assessed: None,
        }];
        assert_eq!(next_objective_id(&mid, &objs).0, "m03-o3");
        assert_eq!(next_objective_id(&mid, &[]).0, "m03-o1");
    }
}
