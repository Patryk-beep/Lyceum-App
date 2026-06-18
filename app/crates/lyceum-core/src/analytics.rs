//! Per-subject analytics for the Analytics screen — computed in the pure core so
//! the frontend never derives mastery. Calibration, a per-objective mastery
//! heatmap, module roll-ups, review-queue health, and the recent history timeline.

use serde::Serialize;
use time::Date;

use crate::model::{Box_, Manifest, ModuleStatus};
use crate::srs;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Calibration {
    pub predictions: u32,
    pub hits: u32,
    /// hits / predictions, or `None` if no predictions logged yet.
    pub accuracy: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleMastery {
    pub module_id: String,
    pub title: String,
    pub level: u8,
    pub status: String,
    pub mean_mastery: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatCell {
    pub module_id: String,
    pub objective_id: String,
    pub mastery: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewHealth {
    pub total: usize,
    pub due: usize,
    pub retired: usize,
    pub lapses: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRow {
    pub date: String,
    pub skill: String,
    pub event: String,
    pub result: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsReport {
    pub subject: String,
    pub level: u8,
    pub target: u8,
    pub modules_total: usize,
    pub modules_mastered: usize,
    pub overall_mastery: Option<f64>,
    pub calibration: Calibration,
    pub modules: Vec<ModuleMastery>,
    pub heatmap: Vec<HeatCell>,
    pub review: ReviewHealth,
    pub history: Vec<HistoryRow>,
}

pub fn analytics(manifest: &Manifest, today: Date) -> AnalyticsReport {
    let modules_mastered = manifest
        .modules
        .iter()
        .filter(|m| m.status == ModuleStatus::Mastered)
        .count();

    let module_means: Vec<f64> = manifest
        .modules
        .iter()
        .filter_map(|m| manifest.module_mean_mastery(m))
        .collect();
    let overall_mastery = if module_means.is_empty() {
        None
    } else {
        Some(module_means.iter().sum::<f64>() / module_means.len() as f64)
    };

    let calibration = manifest
        .calibration
        .as_ref()
        .map(|c| Calibration {
            predictions: c.predictions,
            hits: c.hits,
            accuracy: if c.predictions == 0 {
                None
            } else {
                Some(c.hits as f64 / c.predictions as f64)
            },
        })
        .unwrap_or(Calibration {
            predictions: 0,
            hits: 0,
            accuracy: None,
        });

    let modules = manifest
        .modules
        .iter()
        .map(|m| ModuleMastery {
            module_id: m.id.0.clone(),
            title: m.title.clone(),
            level: m.level,
            status: m.status.as_str().to_string(),
            mean_mastery: manifest.module_mean_mastery(m),
        })
        .collect();

    let heatmap = manifest
        .modules
        .iter()
        .flat_map(|m| {
            m.objectives.iter().map(move |o| HeatCell {
                module_id: m.id.0.clone(),
                objective_id: o.id.0.clone(),
                mastery: o.mastery,
            })
        })
        .collect();

    let retired = manifest
        .review_queue
        .iter()
        .filter(|r| matches!(r.box_, Box_::Retired))
        .count();
    let lapses = manifest.review_queue.iter().map(|r| r.lapses).sum();
    let review = ReviewHealth {
        total: manifest.review_queue.len(),
        due: srs::due_count(&manifest.review_queue, today),
        retired,
        lapses,
    };

    let history = manifest
        .history
        .iter()
        .rev()
        .take(20)
        .map(|h| HistoryRow {
            date: crate::date::format_iso(h.date),
            skill: h.skill.clone(),
            event: h.event.clone(),
            result: h.result.clone(),
        })
        .collect();

    AnalyticsReport {
        subject: manifest.subject.clone(),
        level: manifest.current.level,
        target: manifest.scale.target,
        modules_total: manifest.modules.len(),
        modules_mastered,
        overall_mastery,
        calibration,
        modules,
        heatmap,
        review,
        history,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::golden_manifest;
    use time::macros::date;

    #[test]
    fn golden_analytics_reconcile_with_fixture() {
        let a = analytics(&golden_manifest(), date!(2026 - 06 - 18));
        assert_eq!(a.subject, "Conversational Spanish");
        assert_eq!(a.modules_total, 3);
        assert_eq!(a.modules_mastered, 1);
        // calibration 7/12.
        assert_eq!(a.calibration.predictions, 12);
        assert_eq!(a.calibration.hits, 7);
        assert!((a.calibration.accuracy.unwrap() - 7.0 / 12.0).abs() < 1e-9);
        // heatmap: m01 has 2 objectives, m02 has 1, m03 has 0 -> 3 cells.
        assert_eq!(a.heatmap.len(), 3);
        // overall mastery = mean(0.91, 0.62) = 0.765.
        assert!((a.overall_mastery.unwrap() - 0.765).abs() < 1e-9);
        // reviews due 2026-06-18 = 3; none retired.
        assert_eq!(a.review.due, 3);
        assert_eq!(a.review.retired, 0);
        assert_eq!(a.review.lapses, 1);
        // history newest-first.
        assert_eq!(a.history.len(), 2);
        assert_eq!(a.history[0].skill, "teach-lesson");
    }
}
