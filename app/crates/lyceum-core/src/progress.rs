//! Render `progress.md` in the exact MANIFEST.md §113 shape.
//!
//! The mastery column is the module's mean objective mastery (`—` if never
//! assessed — never invented). `next_action` and `reviews_due` come from the
//! caller (which has disk state + today), keeping this function pure.

use crate::model::{AssignmentStatus, Manifest};

pub fn render_progress(manifest: &Manifest, next_action: &str, reviews_due: usize) -> String {
    let mut out = String::new();

    out.push_str(&format!("# Progress — {}\n\n", manifest.subject));
    out.push_str(&format!(
        "_Updated {} · Level {} of target {} · Status: {}_\n\n",
        crate::date::format_iso(manifest.updated),
        manifest.display_level(),
        manifest.scale.target,
        manifest.current.status.as_str(),
    ));

    out.push_str("## Where you are\n");
    let current_line = match manifest.current_module() {
        Some(m) => format!(
            "{} — {} (L{}), phase: {}",
            m.id,
            m.title,
            m.level,
            manifest.current.phase.map(|p| p.as_str()).unwrap_or("—")
        ),
        None => "—".to_string(),
    };
    out.push_str(&format!("- **Current module:** {current_line}\n"));
    out.push_str(&format!("- **Next action:** {next_action}\n"));

    let (hits, predictions) = manifest
        .calibration
        .as_ref()
        .map(|c| (c.hits, c.predictions))
        .unwrap_or((0, 0));
    out.push_str(&format!(
        "- **Reviews due today:** {reviews_due} (run `review-session`)  ·  **Calibration:** {hits}/{predictions} correct self-predictions\n\n"
    ));

    out.push_str("## Module map\n");
    out.push_str("| Module | Level | Status | Mastery | Taught |\n");
    out.push_str("|---|---|---|---|---|\n");
    for m in &manifest.modules {
        let mastery = match manifest.module_mean_mastery(m) {
            Some(v) => format!("{v:.2}"),
            None => "—".to_string(),
        };
        out.push_str(&format!(
            "| {} — {} | {} | {} | {} | {} |\n",
            m.id,
            m.title,
            m.level,
            m.status.as_str(),
            mastery,
            if m.taught { "yes" } else { "no" },
        ));
    }
    out.push('\n');

    out.push_str("## Recent history\n");
    let recent: Vec<_> = manifest.history.iter().rev().take(8).collect();
    if recent.is_empty() {
        out.push_str("- (no history yet)\n");
    } else {
        for h in recent {
            out.push_str(&format!(
                "- {} · {} · {} → {}\n",
                crate::date::format_iso(h.date),
                h.skill,
                h.event,
                h.result
            ));
        }
    }

    out
}

/// Convenience: count assignments in a given status (used by some callers/UI).
pub fn count_assignments(manifest: &Manifest, status: AssignmentStatus) -> usize {
    manifest
        .assignments
        .iter()
        .filter(|a| a.status == status)
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::golden_manifest;

    #[test]
    fn renders_golden_progress_snapshot() {
        let m = golden_manifest();
        let rendered = render_progress(&m, "deliver the lesson for m02", 3);
        insta::assert_snapshot!(rendered);
    }

    #[test]
    fn unassessed_mastery_is_em_dash_not_zero() {
        let m = golden_manifest();
        let rendered = render_progress(&m, "x", 0);
        // m03 has no scored objectives -> must show — not 0.00
        assert!(rendered.contains("| m03 — "));
        assert!(rendered.contains("| — |") || rendered.contains(" — |"));
    }
}
