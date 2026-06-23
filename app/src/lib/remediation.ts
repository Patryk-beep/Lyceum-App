import type { Manifest, Module, Objective } from "./types";

/** TS mirror of `lyceum_core::routing::gate_failing_objectives` — a module's objectives that
 *  are unscored (`mastery == null`) or below its `masteryThreshold`. A non-empty result means
 *  the module has not cleared its mastery gate. Kept in step with the Rust router (which a
 *  routing unit test pins); used only for display in the remediation notice. */
export function gateFailingObjectives(module: Module): Objective[] {
  return module.objectives.filter(
    (o) => o.mastery == null || o.mastery < module.masteryThreshold,
  );
}

/** The current module's gate-failing objectives, or `[]` when there is no current module. */
export function currentWeakObjectives(manifest: Manifest): Objective[] {
  const id = manifest.current.moduleId;
  const mod = manifest.modules.find((m) => m.id === id);
  return mod ? gateFailingObjectives(mod) : [];
}
