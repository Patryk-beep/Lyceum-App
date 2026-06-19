//! Serde types mirroring `references/MANIFEST.md` 1:1. Camel-case on the wire.
//!
//! Growth-prone structs carry `#[serde(flatten)] extra` so unknown fields survive
//! a round-trip instead of being dropped. Constrained enums (`ScaleStart`, `Box_`)
//! validate loudly at deserialize time rather than silently bucketing into `extra`.

use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_json::{Map, Value};
use time::Date;

use crate::date;

// ---------------------------------------------------------------------------
// Id newtypes — own numeric-suffix parse/format.
// ---------------------------------------------------------------------------

macro_rules! id_newtype {
    ($name:ident) => {
        #[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(pub String);

        impl $name {
            /// The trailing numeric suffix, if any (`m03` -> 3, `m03-o2` -> 2).
            pub fn suffix(&self) -> Option<u32> {
                trailing_number(&self.0)
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str(&self.0)
            }
        }

        impl From<&str> for $name {
            fn from(s: &str) -> Self {
                $name(s.to_string())
            }
        }
    };
}

id_newtype!(ModuleId);
id_newtype!(ObjectiveId);
id_newtype!(AssignmentId);
id_newtype!(ReviewId);

/// Extract the trailing run of ASCII digits as a number.
pub(crate) fn trailing_number(s: &str) -> Option<u32> {
    let digits: String = s
        .chars()
        .rev()
        .take_while(|c| c.is_ascii_digit())
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    digits.parse().ok()
}

// ---------------------------------------------------------------------------
// Constrained enums.
// ---------------------------------------------------------------------------

/// `scale.start`: an integer level 1..=6, or the sentinel `"test"`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScaleStart {
    Level(u8),
    Test,
}

impl Serialize for ScaleStart {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        match self {
            ScaleStart::Level(n) => s.serialize_u8(*n),
            ScaleStart::Test => s.serialize_str("test"),
        }
    }
}

impl<'de> Deserialize<'de> for ScaleStart {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        use serde::de::Error;
        match Value::deserialize(d)? {
            Value::Number(n) => {
                let n = n
                    .as_u64()
                    .ok_or_else(|| D::Error::custom("scale.start must be an integer"))?;
                if (1..=6).contains(&n) {
                    Ok(ScaleStart::Level(n as u8))
                } else {
                    Err(D::Error::custom(format!(
                        "scale.start {n} out of range 1..=6"
                    )))
                }
            }
            Value::String(s) if s == "test" => Ok(ScaleStart::Test),
            other => Err(D::Error::custom(format!(
                "scale.start must be 1..=6 or \"test\", got {other}"
            ))),
        }
    }
}

/// `reviewQueue[].box`: Leitner box 1..=6, or `"retired"`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Box_ {
    N(u8),
    Retired,
}

impl Box_ {
    pub fn number(&self) -> Option<u8> {
        match self {
            Box_::N(n) => Some(*n),
            Box_::Retired => None,
        }
    }
}

impl Serialize for Box_ {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        match self {
            Box_::N(n) => s.serialize_u8(*n),
            Box_::Retired => s.serialize_str("retired"),
        }
    }
}

impl<'de> Deserialize<'de> for Box_ {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        use serde::de::Error;
        match Value::deserialize(d)? {
            Value::Number(n) => {
                let n = n
                    .as_u64()
                    .ok_or_else(|| D::Error::custom("box must be an integer"))?;
                if (1..=6).contains(&n) {
                    Ok(Box_::N(n as u8))
                } else {
                    Err(D::Error::custom(format!("box {n} out of range 1..=6")))
                }
            }
            Value::String(s) if s == "retired" => Ok(Box_::Retired),
            other => Err(D::Error::custom(format!(
                "box must be 1..=6 or \"retired\", got {other}"
            ))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Phase {
    Teach,
    Assign,
    Assess,
    Remediate,
    Capstone,
}

impl Phase {
    pub fn as_str(self) -> &'static str {
        match self {
            Phase::Teach => "teach",
            Phase::Assign => "assign",
            Phase::Assess => "assess",
            Phase::Remediate => "remediate",
            Phase::Capstone => "capstone",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CurrentStatus {
    NotStarted,
    InProgress,
    Mastered,
    Capstone,
    Certified,
}

impl CurrentStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            CurrentStatus::NotStarted => "not-started",
            CurrentStatus::InProgress => "in-progress",
            CurrentStatus::Mastered => "mastered",
            CurrentStatus::Capstone => "capstone",
            CurrentStatus::Certified => "certified",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ModuleStatus {
    Locked,
    Available,
    InProgress,
    Mastered,
}

impl ModuleStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            ModuleStatus::Locked => "locked",
            ModuleStatus::Available => "available",
            ModuleStatus::InProgress => "in-progress",
            ModuleStatus::Mastered => "mastered",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AssignmentStatus {
    Open,
    Submitted,
    Graded,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReviewResult {
    Pass,
    Fail,
}

// ---------------------------------------------------------------------------
// The manifest tree.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub subject: String,
    pub slug: String,
    #[serde(with = "date::iso")]
    pub created: Date,
    #[serde(with = "date::iso")]
    pub updated: Date,
    pub scale: Scale,
    pub current: Current,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placement: Option<Placement>,
    #[serde(default)]
    pub modules: Vec<Module>,
    #[serde(default)]
    pub assignments: Vec<Assignment>,
    #[serde(default)]
    pub review_queue: Vec<ReviewItem>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calibration: Option<Calibration>,
    #[serde(default)]
    pub certification: Option<Certification>,
    #[serde(default)]
    pub history: Vec<HistoryEntry>,
    pub settings: Settings,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Scale {
    pub start: ScaleStart,
    pub target: u8,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Current {
    /// Where the learner is now. `None` before it is resolved — a `scale.start`
    /// of `"test"` has no level until `placement-test` runs. `learn` writes
    /// `null` at creation; `placement-test`/`build-curriculum` set it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub level: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub module_id: Option<ModuleId>,
    /// The active loop phase, `None` until a teaching skill sets it (per
    /// MANIFEST.md: "written by the last skill"). `learn` writes `null` at
    /// creation, before any module exists.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phase: Option<Phase>,
    pub status: CurrentStatus,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Placement {
    pub taken: bool,
    #[serde(
        default,
        with = "date::iso_opt",
        skip_serializing_if = "Option::is_none"
    )]
    pub date: Option<Date>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recommended_level: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub evidence: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Module {
    pub id: ModuleId,
    pub title: String,
    pub level: u8,
    #[serde(default)]
    pub prereqs: Vec<ModuleId>,
    pub status: ModuleStatus,
    #[serde(default)]
    pub taught: bool,
    pub mastery_threshold: f64,
    #[serde(default)]
    pub objectives: Vec<Objective>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Objective {
    pub id: ObjectiveId,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bloom: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mastery: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attempts: Option<u32>,
    #[serde(
        default,
        with = "date::iso_opt",
        skip_serializing_if = "Option::is_none"
    )]
    pub last_assessed: Option<Date>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Assignment {
    pub id: AssignmentId,
    pub module_id: ModuleId,
    #[serde(rename = "type")]
    pub kind: String,
    pub file: String,
    #[serde(default)]
    pub objectives: Vec<ObjectiveId>,
    pub status: AssignmentStatus,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewItem {
    pub item_id: ReviewId,
    pub prompt: String,
    pub answer: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub module_id: Option<ModuleId>,
    #[serde(rename = "box")]
    pub box_: Box_,
    #[serde(with = "date::iso")]
    pub due: Date,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_result: Option<ReviewResult>,
    #[serde(default)]
    pub lapses: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Calibration {
    pub predictions: u32,
    pub hits: u32,
    #[serde(default)]
    pub log: Vec<CalibrationEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CalibrationEntry {
    #[serde(with = "date::iso")]
    pub date: Date,
    pub predicted: String,
    pub actual: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Certification {
    pub certified: bool,
    pub level: u8,
    #[serde(with = "date::iso")]
    pub date: Date,
    #[serde(default)]
    pub criteria: Vec<Criterion>,
    #[serde(default)]
    pub deliverable: String,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Criterion {
    pub name: String,
    pub band: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HistoryEntry {
    #[serde(with = "date::iso")]
    pub date: Date,
    pub skill: String,
    pub event: String,
    #[serde(default)]
    pub result: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default = "default_scheduler")]
    pub scheduler: String,
    #[serde(default = "default_retention")]
    pub retention_target: f64,
    #[serde(default = "default_session_len")]
    pub session_length_min: u32,
    #[serde(default = "default_theme")]
    pub html_theme: String,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

fn default_scheduler() -> String {
    "leitner".to_string()
}
fn default_retention() -> f64 {
    0.90
}
fn default_session_len() -> u32 {
    30
}
fn default_theme() -> String {
    "night".to_string()
}

impl Manifest {
    /// The learner's current level for display. Prefers the explicit
    /// `current.level`; falls back to a numeric `scale.start`; and finally to
    /// `1` for a `"test"`-start subject that has not been placed yet. Keeps the
    /// summary/analytics/progress surfaces showing a sensible level before
    /// `placement-test` resolves one.
    pub fn display_level(&self) -> u8 {
        self.current
            .level
            .or(match self.scale.start {
                ScaleStart::Level(n) => Some(n),
                ScaleStart::Test => None,
            })
            .unwrap_or(1)
    }

    /// The module the learner is currently on, per `current.moduleId`.
    pub fn current_module(&self) -> Option<&Module> {
        let id = self.current.module_id.as_ref()?;
        self.modules.iter().find(|m| &m.id == id)
    }

    /// Mean objective mastery for a module, or `None` if no objective has been assessed.
    pub fn module_mean_mastery(&self, module: &Module) -> Option<f64> {
        let scored: Vec<f64> = module.objectives.iter().filter_map(|o| o.mastery).collect();
        if scored.is_empty() {
            None
        } else {
            Some(scored.iter().sum::<f64>() / scored.len() as f64)
        }
    }
}
