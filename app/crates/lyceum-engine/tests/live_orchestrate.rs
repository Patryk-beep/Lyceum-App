//! Validates the M2 orchestrator against the REAL local Claude: a single turn that
//! writes a manifest via the Write tool, then `run_step` reloads + validates it.
//! Gated behind `LYCEUM_LIVE_CLAUDE=1`. Fast (one Write turn), so it confirms the
//! live spawn -> turn -> file-write -> reload-validator -> progress path that the
//! deterministic `vertical_slice` test fakes.

use std::path::PathBuf;

use lyceum_engine::orchestrate::run_step;
use lyceum_engine::{canonical, workspace, BridgeEvent, ClaudeSession, SpawnConfig};

fn vendored_plugin() -> PathBuf {
    PathBuf::from(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../src-tauri/resources/lyceum"
    ))
}

fn live() -> bool {
    std::env::var("LYCEUM_LIVE_CLAUDE").as_deref() == Ok("1")
}

#[tokio::test]
async fn live_orchestrated_write_reloads_and_validates() {
    if !live() {
        eprintln!("SKIP: set LYCEUM_LIVE_CLAUDE=1 to run the live orchestrate test");
        return;
    }

    let today = time::macros::date!(2026 - 06 - 18);
    let claude = lyceum_engine::resolve_claude(None).expect("claude resolves");
    let tmp = tempfile::tempdir().unwrap();
    let ws = canonical(tmp.path()).unwrap();
    std::fs::create_dir_all(ws.join("learning").join("live-test")).unwrap();
    let staged = workspace::stage_plugin(&vendored_plugin(), &tmp.path().join("stage")).unwrap();

    let cfg = SpawnConfig {
        claude_bin: claude,
        workspace: ws.clone(),
        plugin_dir: staged,
        model: "claude-opus-4-8".into(),
        resume: None,
    };

    let manifest_json = r#"{"subject":"Live Test","slug":"live-test","created":"2026-06-18","updated":"2026-06-18","scale":{"start":1,"target":2},"current":{"level":1,"moduleId":"m01","phase":"teach","status":"in-progress"},"modules":[{"id":"m01","title":"Basics","level":1,"prereqs":[],"status":"in-progress","taught":false,"masteryThreshold":0.9,"objectives":[{"id":"m01-o1","text":"o1"}]}],"assignments":[],"reviewQueue":[],"certification":null,"history":[],"settings":{"scheduler":"leitner","retentionTarget":0.9,"sessionLengthMin":30,"htmlTheme":"night"}}"#;

    let prompt = format!(
        "Use the Write tool to create the file `learning/live-test/manifest.json` with \
         EXACTLY this content and nothing else:\n\n{manifest_json}\n\nDo not run any skills \
         or ask questions. After writing, output the line <<LYCEUM_DONE>>."
    );

    let mut session = ClaudeSession::spawn(&cfg).await.unwrap();
    let mut sink = |_ev: BridgeEvent| {};
    let report = run_step(&mut session, &ws, "live-test", &prompt, today, &mut sink)
        .await
        .expect("run_step completes");
    session.shutdown().await;

    eprintln!(
        "live run_step: valid={} errors={:?} progress={}",
        report.is_valid(),
        report.validation_errors,
        report.progress_written
    );
    assert!(
        report.is_valid(),
        "reloaded manifest valid: {:?}",
        report.validation_errors
    );
    assert!(report.progress_written, "progress.md regenerated");
    let m = report.manifest.as_ref().expect("Claude wrote the manifest");
    assert_eq!(m.subject, "Live Test");
    assert!(ws
        .join("learning")
        .join("live-test")
        .join("progress.md")
        .is_file());
}
