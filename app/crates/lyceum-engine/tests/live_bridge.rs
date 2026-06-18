//! M1 acceptance gates against the REAL local `claude`. Gated behind
//! `LYCEUM_LIVE_CLAUDE=1` so CI / offline runs skip it. Run with:
//!
//!   LYCEUM_LIVE_CLAUDE=1 cargo test -p lyceum-engine --test live_bridge -- --nocapture

use std::path::PathBuf;

use lyceum_engine::{canonical, doctor, resolve_claude, workspace, ClaudeSession, SpawnConfig};

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
async fn m1_bridge_and_skill_gates() {
    if !live() {
        eprintln!("SKIP: set LYCEUM_LIVE_CLAUDE=1 to run the live bridge test");
        return;
    }

    let claude = resolve_claude(None).expect("claude binary resolves");
    let tmp = tempfile::tempdir().unwrap();
    let ws = canonical(tmp.path()).unwrap();
    let staged = workspace::stage_plugin(&vendored_plugin(), &tmp.path().join("stage"))
        .expect("plugin stages + validates");

    let cfg = SpawnConfig {
        claude_bin: claude,
        workspace: ws,
        plugin_dir: staged,
        model: "claude-opus-4-8".into(),
        resume: None,
    };

    // ---- Skill gate + bridge gate (via doctor) ----
    let report = doctor(&cfg).await.expect("doctor completes");
    eprintln!("doctor report: {report:#?}");
    assert!(
        report.mcp_servers_empty,
        "mcp_servers must be [] (isolation)"
    );
    assert_eq!(
        report.api_key_source.as_deref(),
        Some("none"),
        "must use the Max pool, not a per-token API key"
    );
    assert_eq!(
        report.lyceum_skills.len(),
        9,
        "all 9 lyceum skills must load"
    );
    assert!(
        report.lyceum_skills.iter().any(|s| s == "lyceum:learn"),
        "lyceum:learn present"
    );
    assert!(report.result_ok, "probe turn returned a non-error result");
    assert!(report.ok, "doctor overall ok; notes={:?}", report.notes);

    // ---- Bridge resume continuity (same thread remembers across spawns) ----
    let mut s1 = ClaudeSession::spawn(&cfg).await.unwrap();
    let o1 = s1
        .run_turn(
            "Remember this codeword for later: BANANA7. Reply with exactly OK.",
            |_| {},
        )
        .await
        .unwrap();
    assert!(o1.ok, "first turn ok");
    let sid = o1.session_id.clone().expect("session_id captured");
    s1.shutdown().await;

    let resume_cfg = SpawnConfig {
        resume: Some(sid),
        ..cfg.clone()
    };
    let mut s2 = ClaudeSession::spawn(&resume_cfg).await.unwrap();
    let o2 = s2
        .run_turn(
            "What was the codeword I asked you to remember? Reply with just the codeword.",
            |_| {},
        )
        .await
        .unwrap();
    s2.shutdown().await;
    assert!(o2.ok, "resume turn ok");
    assert!(
        o2.text.to_lowercase().contains("banana"),
        "resumed thread recalled the codeword; got {:?}",
        o2.text
    );
}
