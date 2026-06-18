import { invoke } from "@tauri-apps/api/core";

import type {
  Manifest,
  RouteDto,
  SubjectSummary,
  WorkspaceInfo,
} from "./types";

/** Typed wrappers over the Tauri command surface. */
export const api = {
  workspaceInfo: () => invoke<WorkspaceInfo>("workspace_info"),
  listSubjects: () => invoke<SubjectSummary[]>("list_subjects"),
  readManifest: (slug: string) => invoke<Manifest>("read_manifest", { slug }),
  computeNextStep: (slug: string) =>
    invoke<RouteDto>("compute_next_step", { slug }),
  regenerateProgress: (slug: string) =>
    invoke<string>("regenerate_progress", { slug }),
  seedDemo: () => invoke<string>("seed_demo"),
};
