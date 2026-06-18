//! M2 acceptance: a full vertical slice replayed deterministically against a
//! scripted fake-claude (NO live Claude). From an empty `learning/`, the slice
//! creates a subject, teaches + assigns + assesses m01 to mastery, unlocks m02 by
//! the prereq rule, and schedules a Leitner review — validating at every step.

use std::collections::VecDeque;
use std::path::{Path, PathBuf};

use async_trait::async_trait;
use time::macros::date;

use lyceum_core::model::{CurrentStatus, ModuleStatus};
use lyceum_core::srs::Grade;
use lyceum_core::{date as cdate, srs, store, validate};
use lyceum_engine::orchestrate::{run_step, TurnRunner};
use lyceum_engine::{BridgeEvent, Result, TurnOutcome};

type ScriptStep = Box<dyn FnMut(&Path) + Send>;

/// A fake that, on each turn, performs the next scripted workspace mutation (what
/// the real skill would write) and emits a minimal init + result.
struct FakeClaude {
    subject_dir: PathBuf,
    script: VecDeque<ScriptStep>,
}

#[async_trait]
impl TurnRunner for FakeClaude {
    async fn turn(
        &mut self,
        _prompt: &str,
        on_event: &mut (dyn FnMut(BridgeEvent) + Send),
    ) -> Result<TurnOutcome> {
        on_event(BridgeEvent::SessionInit {
            session_id: "fake".into(),
            model: Some("fake".into()),
            api_key_source: Some("none".into()),
            mcp_servers_empty: true,
            lyceum_skills: vec![],
            plugin_ok: true,
        });
        if let Some(mut step) = self.script.pop_front() {
            step(&self.subject_dir);
        }
        let outcome = TurnOutcome {
            session_id: Some("fake".into()),
            ok: true,
            stop_reason: Some("end_turn".into()),
            text: "ok".into(),
            cost_usd_list_price: 0.0,
        };
        on_event(BridgeEvent::TurnResult {
            turn_id: 0,
            ok: true,
            stop_reason: Some("end_turn".into()),
            text: "ok".into(),
            cost_usd_list_price: 0.0,
        });
        Ok(outcome)
    }
}

fn write_manifest(dir: &Path, json: &str) {
    std::fs::create_dir_all(dir).unwrap();
    // Sanity: the scripted manifest must itself parse (the fake never writes junk).
    serde_json::from_str::<lyceum_core::model::Manifest>(json)
        .unwrap_or_else(|e| panic!("scripted manifest invalid: {e}\n{json}"));
    std::fs::write(dir.join("manifest.json"), json).unwrap();
}

const M_CURRICULUM: &str = r#"{
  "subject":"Test Subject","slug":"test-subject","created":"2026-06-18","updated":"2026-06-18",
  "scale":{"start":1,"target":2},
  "current":{"level":1,"moduleId":"m01","phase":"teach","status":"in-progress"},
  "modules":[
    {"id":"m01","title":"Basics","level":1,"prereqs":[],"status":"in-progress","taught":false,"masteryThreshold":0.9,
     "objectives":[{"id":"m01-o1","text":"o1"},{"id":"m01-o2","text":"o2"}]},
    {"id":"m02","title":"Intermediate","level":2,"prereqs":["m01"],"status":"locked","taught":false,"masteryThreshold":0.9,
     "objectives":[{"id":"m02-o1","text":"x"}]}
  ],
  "assignments":[],"reviewQueue":[],"certification":null,"history":[],
  "settings":{"scheduler":"leitner","retentionTarget":0.9,"sessionLengthMin":30,"htmlTheme":"night"}
}"#;

const M_TAUGHT: &str = r#"{
  "subject":"Test Subject","slug":"test-subject","created":"2026-06-18","updated":"2026-06-18",
  "scale":{"start":1,"target":2},
  "current":{"level":1,"moduleId":"m01","phase":"assign","status":"in-progress"},
  "modules":[
    {"id":"m01","title":"Basics","level":1,"prereqs":[],"status":"in-progress","taught":true,"masteryThreshold":0.9,
     "objectives":[{"id":"m01-o1","text":"o1"},{"id":"m01-o2","text":"o2"}]},
    {"id":"m02","title":"Intermediate","level":2,"prereqs":["m01"],"status":"locked","taught":false,"masteryThreshold":0.9,
     "objectives":[{"id":"m02-o1","text":"x"}]}
  ],
  "assignments":[],"reviewQueue":[],"certification":null,"history":[],
  "settings":{"scheduler":"leitner","retentionTarget":0.9,"sessionLengthMin":30,"htmlTheme":"night"}
}"#;

const M_ASSIGNED: &str = r#"{
  "subject":"Test Subject","slug":"test-subject","created":"2026-06-18","updated":"2026-06-18",
  "scale":{"start":1,"target":2},
  "current":{"level":1,"moduleId":"m01","phase":"assign","status":"in-progress"},
  "modules":[
    {"id":"m01","title":"Basics","level":1,"prereqs":[],"status":"in-progress","taught":true,"masteryThreshold":0.9,
     "objectives":[{"id":"m01-o1","text":"o1"},{"id":"m01-o2","text":"o2"}]},
    {"id":"m02","title":"Intermediate","level":2,"prereqs":["m01"],"status":"locked","taught":false,"masteryThreshold":0.9,
     "objectives":[{"id":"m02-o1","text":"x"}]}
  ],
  "assignments":[{"id":"a01","moduleId":"m01","type":"short","file":"assignments/01-m01-short.md","objectives":["m01-o1","m01-o2"],"status":"open"}],
  "reviewQueue":[],"certification":null,"history":[],
  "settings":{"scheduler":"leitner","retentionTarget":0.9,"sessionLengthMin":30,"htmlTheme":"night"}
}"#;

const M_ASSESSED: &str = r#"{
  "subject":"Test Subject","slug":"test-subject","created":"2026-06-18","updated":"2026-06-18",
  "scale":{"start":1,"target":2},
  "current":{"level":1,"moduleId":"m02","phase":"teach","status":"in-progress"},
  "modules":[
    {"id":"m01","title":"Basics","level":1,"prereqs":[],"status":"mastered","taught":true,"masteryThreshold":0.9,
     "objectives":[{"id":"m01-o1","text":"o1","mastery":0.92,"attempts":1,"lastAssessed":"2026-06-18"},
                   {"id":"m01-o2","text":"o2","mastery":0.91,"attempts":1,"lastAssessed":"2026-06-18"}]},
    {"id":"m02","title":"Intermediate","level":2,"prereqs":["m01"],"status":"available","taught":false,"masteryThreshold":0.9,
     "objectives":[{"id":"m02-o1","text":"x"}]}
  ],
  "assignments":[{"id":"a01","moduleId":"m01","type":"short","file":"assignments/01-m01-short.md","objectives":["m01-o1","m01-o2"],"status":"graded"}],
  "reviewQueue":[{"itemId":"r001","prompt":"recall o1","answer":"a","moduleId":"m01","box":1,"due":"2026-06-19","lastResult":"pass","lapses":0}],
  "certification":null,
  "history":[{"date":"2026-06-18","skill":"assess-understanding","event":"graded m01","result":"Proficient; m01 mastered"}],
  "settings":{"scheduler":"leitner","retentionTarget":0.9,"sessionLengthMin":30,"htmlTheme":"night"}
}"#;

fn side_files(dir: &Path) {
    std::fs::create_dir_all(dir).unwrap();
    std::fs::write(dir.join("research.md"), "# research\n").unwrap();
    std::fs::write(dir.join("knowledge-map.json"), "{}\n").unwrap();
    std::fs::write(dir.join("curriculum.json"), "{}\n").unwrap();
}

#[tokio::test]
async fn full_vertical_slice_replays_deterministically() {
    let today = date!(2026 - 06 - 18);
    let tmp = tempfile::tempdir().unwrap();
    let workspace = tmp.path().to_path_buf();
    let slug = "test-subject";
    let subject_dir = workspace.join("learning").join(slug);

    // Empty learning/ at the start.
    assert!(!subject_dir.exists());

    let mk = |json: &'static str, also_side: bool| -> ScriptStep {
        Box::new(move |dir: &Path| {
            if also_side {
                side_files(dir);
            }
            write_manifest(dir, json);
        })
    };

    let mut fake = FakeClaude {
        subject_dir: subject_dir.clone(),
        script: VecDeque::from(vec![
            mk(M_CURRICULUM, true), // turn 1: research + curriculum (writes side files)
            mk(M_TAUGHT, false),    // turn 2: teach m01
            mk(M_ASSIGNED, false),  // turn 3: create assignment
            mk(M_ASSESSED, false),  // turn 4: submit + assess
        ]),
    };

    let mut sink = |_ev: BridgeEvent| {};

    // ---- Turn 1: create + curriculum ----
    let r1 = run_step(&mut fake, &workspace, slug, "create", today, &mut sink)
        .await
        .unwrap();
    assert!(r1.is_valid(), "turn1 invalid: {:?}", r1.validation_errors);
    assert!(r1.progress_written);
    let m = r1.manifest.unwrap();
    assert_eq!(m.modules.len(), 2);
    assert_eq!(m.modules[1].status, ModuleStatus::Locked); // m02 locked

    // ---- Turn 2: teach ----
    let r2 = run_step(&mut fake, &workspace, slug, "teach m01", today, &mut sink)
        .await
        .unwrap();
    assert!(r2.is_valid(), "turn2 invalid: {:?}", r2.validation_errors);
    assert!(r2.manifest.unwrap().current_module().unwrap().taught);

    // ---- Turn 3: create assignment ----
    let r3 = run_step(&mut fake, &workspace, slug, "assign m01", today, &mut sink)
        .await
        .unwrap();
    assert!(r3.is_valid(), "turn3 invalid: {:?}", r3.validation_errors);
    assert_eq!(r3.manifest.unwrap().assignments.len(), 1);

    // ---- Turn 4: assess (the gate) ----
    let r4 = run_step(&mut fake, &workspace, slug, "assess a01", today, &mut sink)
        .await
        .unwrap();
    assert!(r4.is_valid(), "turn4 invalid: {:?}", r4.validation_errors);
    let m4 = r4.manifest.unwrap();

    // m01 mastered, m02 unlocked by the prereq rule.
    let m01 = m4.modules.iter().find(|m| m.id.0 == "m01").unwrap();
    let m02 = m4.modules.iter().find(|m| m.id.0 == "m02").unwrap();
    assert_eq!(m01.status, ModuleStatus::Mastered, "m01 mastered");
    assert_eq!(m02.status, ModuleStatus::Available, "m02 unlocked");
    assert_eq!(m4.current.status, CurrentStatus::InProgress);

    // A review was scheduled with a Leitner-correct due (box 1 -> +1 day).
    assert_eq!(m4.review_queue.len(), 1);
    let r001 = &m4.review_queue[0];
    assert_eq!(cdate::format_iso(r001.due), "2026-06-19");

    // ---- Turn 5: deterministic review (no Claude) advances the Leitner box ----
    let path = workspace.join("learning").join(slug).join("manifest.json");
    let mut m5 = store::load(&path).unwrap();
    srs::apply_grade(&mut m5.review_queue[0], Grade::Good, today);
    store::save(&path, &mut m5, today, "2026-06-18T00-00-05").unwrap();

    let reloaded = store::load(&path).unwrap();
    let r001b = &reloaded.review_queue[0];
    assert_eq!(r001b.box_.number(), Some(2), "box 1 -> 2 on pass");
    // box 2 interval is 3 days (Leitner table).
    assert_eq!(cdate::format_iso(r001b.due), "2026-06-21");
    assert!(
        validate::validate(&reloaded).is_empty(),
        "final manifest valid"
    );

    // progress.md exists and is non-empty.
    let progress = std::fs::read_to_string(subject_dir.join("progress.md")).unwrap();
    assert!(progress.contains("# Progress — Test Subject"));
    assert!(!progress.trim().is_empty());
}

#[tokio::test]
async fn validator_halts_on_an_impossible_state() {
    // If a mis-loaded session writes m01 mastered with an unassessed objective, the
    // step must surface validation errors (HALT), not silently propagate corruption.
    let today = date!(2026 - 06 - 18);
    let tmp = tempfile::tempdir().unwrap();
    let workspace = tmp.path().to_path_buf();
    let slug = "test-subject";
    let subject_dir = workspace.join("learning").join(slug);

    const BAD: &str = r#"{
      "subject":"Bad","slug":"test-subject","created":"2026-06-18","updated":"2026-06-18",
      "scale":{"start":1,"target":1},
      "current":{"level":1,"moduleId":"m01","phase":"assess","status":"in-progress"},
      "modules":[{"id":"m01","title":"B","level":1,"prereqs":[],"status":"mastered","taught":true,"masteryThreshold":0.9,
        "objectives":[{"id":"m01-o1","text":"o1"}]}],
      "assignments":[],"reviewQueue":[],"certification":null,"history":[],
      "settings":{"scheduler":"leitner","retentionTarget":0.9,"sessionLengthMin":30,"htmlTheme":"night"}
    }"#;

    let mut fake = FakeClaude {
        subject_dir: subject_dir.clone(),
        script: VecDeque::from(vec![Box::new(move |dir: &Path| {
            write_manifest(dir, BAD);
        }) as ScriptStep]),
    };
    let mut sink = |_ev: BridgeEvent| {};
    let r = run_step(&mut fake, &workspace, slug, "assess", today, &mut sink)
        .await
        .unwrap();
    assert!(!r.is_valid(), "must flag the impossible state");
    assert!(
        !r.progress_written,
        "must not write progress on an invalid manifest"
    );
}
