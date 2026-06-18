//! Shared builders for unit tests (compiled only under `cfg(test)`).

use time::macros::date;

use crate::model::*;

pub fn module(id: &str, level: u8, prereqs: &[&str], status: ModuleStatus) -> Module {
    Module {
        id: ModuleId(id.into()),
        title: format!("Module {id}"),
        level,
        prereqs: prereqs.iter().map(|p| ModuleId((*p).into())).collect(),
        status,
        taught: false,
        mastery_threshold: super::mastery::default_threshold(level),
        objectives: vec![],
        extra: Default::default(),
    }
}

pub fn base_manifest() -> Manifest {
    Manifest {
        subject: "Test Subject".into(),
        slug: "test-subject".into(),
        created: date!(2026 - 06 - 17),
        updated: date!(2026 - 06 - 17),
        scale: Scale {
            start: ScaleStart::Level(2),
            target: 4,
        },
        current: Current {
            level: 2,
            module_id: None,
            phase: Phase::Teach,
            status: CurrentStatus::InProgress,
        },
        placement: None,
        modules: vec![],
        assignments: vec![],
        review_queue: vec![],
        calibration: None,
        certification: None,
        history: vec![],
        settings: Settings {
            scheduler: "leitner".into(),
            retention_target: 0.90,
            session_length_min: 30,
            html_theme: "night".into(),
            extra: Default::default(),
        },
        extra: Default::default(),
    }
}

pub fn manifest_with_modules(modules: Vec<Module>) -> Manifest {
    let mut m = base_manifest();
    m.modules = modules;
    m
}

/// A richer, deterministic fixture: m01 mastered, m02 in-progress, m03 available
/// (unassessed). Mirrors the `fixtures/manifests/golden.json` used by the UI.
pub fn golden_manifest() -> Manifest {
    let mut m = base_manifest();
    m.subject = "Conversational Spanish".into();
    m.slug = "conversational-spanish".into();
    m.created = date!(2026 - 06 - 10);
    m.updated = date!(2026 - 06 - 18);
    m.current = Current {
        level: 2,
        module_id: Some(ModuleId("m02".into())),
        phase: Phase::Assign,
        status: CurrentStatus::InProgress,
    };
    m.placement = Some(Placement {
        taken: true,
        date: Some(date!(2026 - 06 - 10)),
        recommended_level: Some(2),
        evidence: Some("floor at L2, ceiling at L3".into()),
    });

    let mut m01 = module("m01", 1, &[], ModuleStatus::Mastered);
    m01.title = "Sound system & greetings".into();
    m01.taught = true;
    m01.objectives = vec![
        Objective {
            id: ObjectiveId("m01-o1".into()),
            text: "Produce the five vowel sounds accurately".into(),
            bloom: Some("Apply".into()),
            mastery: Some(0.92),
            attempts: Some(2),
            last_assessed: Some(date!(2026 - 06 - 12)),
        },
        Objective {
            id: ObjectiveId("m01-o2".into()),
            text: "Exchange formal greetings".into(),
            bloom: Some("Apply".into()),
            mastery: Some(0.90),
            attempts: Some(1),
            last_assessed: Some(date!(2026 - 06 - 12)),
        },
    ];

    let mut m02 = module("m02", 2, &["m01"], ModuleStatus::InProgress);
    m02.title = "Present tense & daily routines".into();
    m02.taught = true;
    m02.objectives = vec![Objective {
        id: ObjectiveId("m02-o1".into()),
        text: "Conjugate regular -ar verbs in present tense".into(),
        bloom: Some("Apply".into()),
        mastery: Some(0.62),
        attempts: Some(1),
        last_assessed: Some(date!(2026 - 06 - 17)),
    }];

    let mut m03 = module("m03", 2, &["m02"], ModuleStatus::Locked);
    m03.title = "Past tense & storytelling".into();
    m03.taught = false;
    // no objectives scored -> mastery shows as —

    m.modules = vec![m01, m02, m03];

    m.assignments = vec![Assignment {
        id: AssignmentId("a02".into()),
        module_id: ModuleId("m02".into()),
        kind: "guided-practice".into(),
        file: "assignments/02-m02-guided-practice.md".into(),
        objectives: vec![ObjectiveId("m02-o1".into())],
        status: AssignmentStatus::Open,
        extra: Default::default(),
    }];

    m.review_queue = vec![
        ReviewItem {
            item_id: ReviewId("r001".into()),
            prompt: "How do you ask someone's name (formal)?".into(),
            answer: "¿Cómo se llama usted?".into(),
            module_id: Some(ModuleId("m01".into())),
            box_: Box_::N(3),
            due: date!(2026 - 06 - 18),
            last_result: Some(ReviewResult::Pass),
            lapses: 0,
        },
        ReviewItem {
            item_id: ReviewId("r002".into()),
            prompt: "Conjugate 'hablar' (yo)".into(),
            answer: "hablo".into(),
            module_id: Some(ModuleId("m02".into())),
            box_: Box_::N(1),
            due: date!(2026 - 06 - 18),
            last_result: None,
            lapses: 0,
        },
        ReviewItem {
            item_id: ReviewId("r003".into()),
            prompt: "Say 'good morning'".into(),
            answer: "buenos días".into(),
            module_id: Some(ModuleId("m01".into())),
            box_: Box_::N(2),
            due: date!(2026 - 06 - 17),
            last_result: Some(ReviewResult::Pass),
            lapses: 1,
        },
    ];

    m.calibration = Some(Calibration {
        predictions: 12,
        hits: 7,
        log: vec![CalibrationEntry {
            date: date!(2026 - 06 - 17),
            predicted: "correct".into(),
            actual: "incorrect".into(),
        }],
    });

    m.history = vec![
        HistoryEntry {
            date: date!(2026 - 06 - 12),
            skill: "assess-understanding".into(),
            event: "graded m01 assignment".into(),
            result: "Proficient; m01 mastered".into(),
        },
        HistoryEntry {
            date: date!(2026 - 06 - 17),
            skill: "teach-lesson".into(),
            event: "delivered m02".into(),
            result: "lesson complete; assignment created".into(),
        },
    ];

    m
}
