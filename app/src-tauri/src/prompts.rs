//! Build the generative turn prompt for a routed step (§6 delegation). The prompt
//! NAMES the lyceum skill, pins the subject, restates the file contract, and ends
//! with the DONE sentinel. Returns `None` for routes the learner drives in the UI
//! (completing an open assignment, a finished course).

use lyceum_core::routing::Route;

pub const DONE_SENTINEL: &str = "<<LYCEUM_DONE>>";

pub fn prompt_for(route: &Route, slug: &str) -> Option<String> {
    let (skill, focus) = match route {
        Route::Research => ("research-topic", String::new()),
        Route::Placement => ("placement-test", String::new()),
        Route::BuildCurriculum => ("build-curriculum", String::new()),
        Route::Teach { module_id } => ("teach-lesson", format!(" for module {module_id}")),
        Route::CreateAssignment { module_id } => {
            ("create-assignment", format!(" for module {module_id}"))
        }
        Route::Assess { assignment_id } => (
            "assess-understanding",
            format!(" for assignment {assignment_id}"),
        ),
        Route::Capstone => ("capstone", String::new()),
        // Learner-driven / terminal — no generative turn.
        Route::CompleteOpenAssignment { .. } | Route::CourseComplete => return None,
    };

    Some(format!(
        "You are operating the Lyceum learning system over the workspace folder \
         `learning/{slug}/`. FIRST read `learning/{slug}/manifest.json` — it is the \
         single source of truth (see references/MANIFEST.md). Then run the \
         `lyceum:{skill}` skill{focus}. Write every result to the files that skill \
         specifies (update `manifest.json`, bump `updated`, and append to `history`), \
         following the MANIFEST.md contract exactly — do not invent fields. Do not ask \
         the user any questions. When the step is fully complete, output the line \
         {DONE_SENTINEL} and nothing after it."
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use lyceum_core::model::ModuleId;

    #[test]
    fn generative_routes_name_their_skill_and_subject() {
        let p = prompt_for(
            &Route::Teach {
                module_id: ModuleId("m01".into()),
            },
            "spanish",
        )
        .unwrap();
        assert!(p.contains("lyceum:teach-lesson"));
        assert!(p.contains("module m01"));
        assert!(p.contains("learning/spanish/"));
        assert!(p.ends_with(DONE_SENTINEL) || p.contains(DONE_SENTINEL));
    }

    #[test]
    fn learner_driven_routes_have_no_prompt() {
        assert!(prompt_for(&Route::CourseComplete, "x").is_none());
        assert!(prompt_for(
            &Route::CompleteOpenAssignment {
                assignment_id: lyceum_core::model::AssignmentId("a01".into())
            },
            "x"
        )
        .is_none());
    }
}
