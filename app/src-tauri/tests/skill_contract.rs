//! Contract-drift guard for the feynman-grade research refinement.
//!
//! This is NOT a behavioral test of research quality (that is an LLM prompt run
//! headless; it is proven by the live smoke, not here). It is a *drift guard*:
//! it pins the shared `openQuestions` contract and the four-pass / self-verifying
//! -citation discipline so the writer skill (`research-topic`) and the reader
//! skills (`teach-lesson`, `build-curriculum`) cannot silently diverge, and so
//! the refinement provably reaches the *fallback* path (the real production path
//! in the headless child — see adversary F2).
//!
//! Resources resolve deterministically via CARGO_MANIFEST_DIR → app/src-tauri.

use std::fs;
use std::path::PathBuf;

fn read_skill(name: &str) -> String {
    let path: PathBuf = [
        env!("CARGO_MANIFEST_DIR"),
        "resources",
        "lyceum",
        "skills",
        name,
        "SKILL.md",
    ]
    .iter()
    .collect();
    fs::read_to_string(&path).unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()))
}

/// Assert `haystack` contains `needle`, with a contract-drift-flavored message.
fn must_contain(skill: &str, haystack: &str, needle: &str, why: &str) {
    assert!(
        haystack.contains(needle),
        "contract drift in {skill}/SKILL.md: missing {needle:?} ({why})"
    );
}

// ----- research-topic (writer) — P0 -----------------------------------------

#[test]
fn research_topic_documents_open_questions() {
    let s = read_skill("research-topic");
    must_contain(
        "research-topic",
        &s,
        "openQuestions",
        "the additive contract key must be documented by the writer",
    );
    // Closed key set (F7): the relaxed guardrail must still forbid foreign keys.
    must_contain(
        "research-topic",
        &s,
        "no other top-level keys",
        "relaxed five-key guard must stay CLOSED (F7)",
    );
}

#[test]
fn research_topic_names_the_four_passes() {
    let s = read_skill("research-topic");
    for role in ["Researcher", "Reviewer", "Verifier", "Writer"] {
        must_contain(
            "research-topic",
            &s,
            role,
            "the four feynman passes must be named",
        );
    }
}

#[test]
fn research_topic_four_passes_reach_the_fallback_path() {
    // Adversary F2: the dynamic Workflow is almost never live in the headless
    // child, so the four passes MUST be attached to the sequential fallback —
    // not only a Workflow sketch. This phrase only makes sense in the fallback
    // context, so its presence proves the refinement reached production.
    let s = read_skill("research-topic");
    must_contain(
        "research-topic",
        &s,
        "same four passes",
        "self-verify discipline must reach the FALLBACK path (F2)",
    );
}

#[test]
fn research_topic_self_verification_is_watchdog_safe() {
    let s = read_skill("research-topic");
    // F1: verify against already-fetched content, never re-fetch in a loop.
    must_contain(
        "research-topic",
        &s,
        "already retrieved this run",
        "Verifier must reuse fetched content, not re-fetch (F1 watchdog-safety)",
    );
    // F3: an unreachable source must not thin the map below today's floor.
    must_contain(
        "research-topic",
        &s,
        "not grounds to drop",
        "unreachable source must NOT drop a corroborated claim (F3 floor)",
    );
}

#[test]
fn research_topic_preserves_headless_invariants() {
    // Regression guard (green before AND after): the refinement must not erode
    // the load-bearing invariants. Fails loudly if a rewrite deletes them.
    let s = read_skill("research-topic");
    let low = s.to_lowercase();
    must_contain(
        "research-topic",
        &low,
        "never stop and never ask",
        "headless never-ask invariant",
    );
    must_contain(
        "research-topic",
        &low,
        "fallback",
        "Workflow-preferred-never-required + silent fallback",
    );
    must_contain(
        "research-topic",
        &low,
        "valid artifacts",
        "always-terminate-with-valid-artifacts invariant",
    );
    must_contain(
        "research-topic",
        &low,
        "never write mastery",
        "mastery-read-only invariant",
    );
}
