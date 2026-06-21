//! # lyceum-core
//!
//! The deterministic engine behind Lyceum-App. **Pure**: no Tauri, no tokio, no
//! windowing — it compiles and tests headless (`cargo test -p lyceum-core`). It
//! owns the manifest model, SRS scheduling, mastery gating, the learn router, id
//! allocation, atomic persistence, and `progress.md` rendering.
//!
//! ## The two contracts (from MANIFEST.md)
//! 1. **State, not conversation** — read manifest, act, write manifest.
//! 2. **Single writer for mastery** — only assess/review write `objective.mastery`
//!    or flip a module to `mastered`; only capstone certifies. Enforced here at the
//!    type level: mastery-bearing mutations require a [`MasteryWriter`] capability
//!    token that this crate never constructs for application code.

pub mod analytics;
pub mod concurrency;
pub mod date;
pub mod error;
pub mod ids;
pub mod mastery;
pub mod model;
pub mod progress;
pub mod routing;
pub mod srs;
pub mod store;
pub mod streak;
pub mod summary;
pub mod validate;

#[cfg(any(test, feature = "fixtures"))]
pub mod test_support;

pub use error::{CoreError, Result};

/// Capability token permitting ordinary, non-mastery writes (SRS schedule, nav for
/// app-initiated moves, settings, review-queue ids). Application code may freely
/// construct this.
#[derive(Debug, Clone, Copy)]
pub struct AppWriter(());

impl AppWriter {
    pub fn new() -> Self {
        AppWriter(())
    }
}

impl Default for AppWriter {
    fn default() -> Self {
        Self::new()
    }
}

/// Capability token permitting mastery-bearing writes — raising `objective.mastery`,
/// flipping a module to `mastered`, or writing `certification`.
///
/// `lyceum-core` **never** exposes a constructor to downstream (application) crates:
/// `new_internal` is `pub(crate)`, so only this crate's own code (the simulated
/// assess/review path used in tests and, later, the verified reload pipeline) can
/// mint one. The `src-tauri` shell physically cannot build a `MasteryWriter`, which
/// is what makes "the app can never assert mastery" a compile-time guarantee rather
/// than a convention. A `trybuild` test (M2) pins this.
#[derive(Debug, Clone, Copy)]
pub struct MasteryWriter(());

impl MasteryWriter {
    // Load-bearing scaffolding for M2's verified reload/assess path; currently only
    // exercised by in-crate tests. `allow(dead_code)` until the engine wires it in.
    #[allow(dead_code)]
    pub(crate) fn new_internal() -> Self {
        MasteryWriter(())
    }
}

#[cfg(test)]
mod capability_tests {
    use super::*;

    #[test]
    fn app_writer_is_constructible() {
        let _ = AppWriter::new();
    }

    #[test]
    fn mastery_writer_is_crate_internal_only() {
        // This compiles only because we are inside the crate. Downstream crates
        // cannot call `new_internal` (it is pub(crate)); the trybuild test in M2
        // asserts that at the type level.
        let _ = MasteryWriter::new_internal();
    }
}
