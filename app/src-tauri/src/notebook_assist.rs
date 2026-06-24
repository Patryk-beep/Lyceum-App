//! Notebook AI assist: a THIRD read-only `claude` child that turns a note into an
//! editable SUGGESTION (flashcards / summary / related concepts / tags).
//!
//! Like the tutor, it is spawned `read_only` (allowlist `Read,Grep,Glob,Skill`) so
//! it physically cannot write any file — it only returns text. The learner reviews
//! the suggestion and explicitly accepts (the app writes it via the normal notebook
//! commands) or rejects it; nothing is ever auto-applied. One-shot: a fresh child
//! per request, shut down after, bounded by `notebook_slots`.

use std::time::Duration;

use tauri::{AppHandle, Emitter, State};

use lyceum_engine::{BridgeEvent, ClaudeSession};

use crate::engine_cmds::spawn_config;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// A notebook-assist `BridgeEvent` tagged with its subject — emitted on the
/// dedicated `claude://notebook` channel (parallel to `claude://tutor`).
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NotebookEnvelope {
    slug: String,
    event: BridgeEvent,
}

/// The instruction for each assist mode. Unknown modes are rejected (no silent default).
fn mode_instruction(mode: &str) -> AppResult<&'static str> {
    Ok(match mode {
        "flashcards" => {
            "From the note below, propose 3–6 spaced-repetition flashcards as cloze lines using \
             ==answer== markup (wrap the hidden answer in double-equals). Output ONLY those lines, \
             one per line, ready to paste — no preamble or commentary."
        }
        "summarize" => {
            "Summarize the note below into 3–5 tight bullet points that capture the key ideas. \
             Output only the bullets."
        }
        "related" => {
            "Using the note below and this subject's materials, suggest 3–5 related concepts or \
             lessons the learner should connect this to. Output a short bullet list only."
        }
        "tags" => {
            "Suggest 3–6 short lowercase topic tags for the note below, comma-separated on one \
             line. Output only the tags."
        }
        other => return Err(AppError::msg(format!("unknown assist mode: {other}"))),
    })
}

/// Build the read-only assist prompt for `mode` over the learner's note `content`.
pub fn assist_prompt(slug: &str, mode: &str, content: &str) -> AppResult<String> {
    let instruction = mode_instruction(mode)?;
    Ok(format!(
        "You are the Lyceum NOTEBOOK ASSISTANT for the subject in the workspace folder \
         `learning/{slug}/`. You are STRICTLY READ-ONLY — you have no write tools and must never \
         modify the manifest, mastery, notes, or any file; you only return text that the learner \
         will review and accept or reject. You MAY read this subject's materials for context \
         (`research.md`, `knowledge-map.json`, `curriculum.json`, the `lessons/` files). Stay \
         within THIS subject's folder. {instruction}\n\nThe learner's note:\n{content}"
    ))
}

/// Run one assist turn for a note and return the suggestion text. Streams
/// `BridgeEvent`s on `claude://notebook`. NEVER writes — the child is read-only and
/// the app applies nothing here (accept happens later via `update_notebook`).
#[tauri::command]
pub async fn notebook_assist(
    app: AppHandle,
    state: State<'_, AppState>,
    slug: String,
    mode: String,
    content: String,
) -> AppResult<String> {
    crate::delete::validate_slug(&slug)?;
    if content.trim().is_empty() {
        return Err(AppError::msg("nothing to work with — write a note first"));
    }
    let prompt = assist_prompt(&slug, &mode, &content)?;

    let app2 = app.clone();
    let ev_slug = slug.clone();
    let on_event = move |ev: BridgeEvent| {
        let _ = app2.emit(
            "claude://notebook",
            NotebookEnvelope {
                slug: ev_slug.clone(),
                event: ev,
            },
        );
    };

    let _permit = state
        .notebook_slots
        .clone()
        .acquire_owned()
        .await
        .map_err(|e| AppError::msg(e.to_string()))?;
    // Don't spawn for a subject deleted while we waited on a permit.
    if !crate::workspace::manifest_path(&state.workspace, &slug).is_file() {
        return Err(AppError::msg("subject was deleted"));
    }

    let mut session = ClaudeSession::spawn(&spawn_config(state.inner(), None, true)?)
        .await
        .map_err(|e| AppError::msg(e.to_string()))?;
    let outcome = session
        .run_turn(&prompt, on_event)
        .await
        .map_err(|e| AppError::msg(e.to_string()))?;
    // One-shot: tear the child down (bounded), ignoring a slow shutdown.
    let _ = tokio::time::timeout(Duration::from_secs(5), session.shutdown()).await;
    Ok(outcome.text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flashcards_prompt_pins_readonly_cloze_and_context() {
        let p = assist_prompt("spanish", "flashcards", "ser is permanent").unwrap();
        assert!(p.contains("READ-ONLY"));
        assert!(p.contains("==answer=="), "names the cloze syntax");
        assert!(p.contains("learning/spanish/"));
        assert!(p.contains("ser is permanent"));
    }

    #[test]
    fn every_known_mode_builds_a_prompt() {
        for mode in ["flashcards", "summarize", "related", "tags"] {
            assert!(assist_prompt("s", mode, "a note").is_ok(), "mode {mode}");
        }
    }

    #[test]
    fn unknown_mode_is_rejected() {
        assert!(assist_prompt("s", "delete-everything", "x").is_err());
    }
}
