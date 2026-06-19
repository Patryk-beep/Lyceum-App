import { invoke } from "@tauri-apps/api/core";

import type {
  AnalyticsReport,
  DeleteLessonResult,
  LessonEntry,
  Manifest,
  PlacementPool,
  PlacementState,
  ReviewCandidate,
  ReviewGrade,
  RouteDto,
  StepDto,
  StreakInfo,
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
  reviewDue: (slug: string) => invoke<ReviewCandidate[]>("review_due", { slug }),
  reviewGrade: (slug: string, itemId: string, grade: ReviewGrade) =>
    invoke<Manifest>("review_grade", { slug, itemId, grade }),
  runSubjectStep: (slug: string) => invoke<StepDto>("run_subject_step", { slug }),
  createSubject: (subject: string, target: number, start: string) =>
    invoke<string>("create_subject", { subject, target, start }),
  subjectAnalytics: (slug: string) =>
    invoke<AnalyticsReport>("subject_analytics", { slug }),
  studyStreak: () => invoke<StreakInfo>("study_streak"),
  readArtifact: (slug: string, relpath: string) =>
    invoke<string>("read_artifact", { slug, relpath }),
  placementPool: (slug: string) =>
    invoke<PlacementPool>("placement_pool", { slug }),
  placementStep: (answers: boolean[]) =>
    invoke<PlacementState>("placement_step", { answers }),
  placementFinalize: (slug: string, level: number, evidence: string) =>
    invoke<Manifest>("placement_finalize", { slug, level, evidence }),
  listLessons: (slug: string) => invoke<LessonEntry[]>("list_lessons", { slug }),
  // moduleId is the authoritative id resolved by listLessons (backend never
  // re-parses the filename); pass "" when a lesson maps to no module.
  deleteLesson: (slug: string, moduleId: string, file: string) =>
    invoke<DeleteLessonResult>("delete_lesson", { slug, moduleId, file }),
  deleteAssignment: (slug: string, assignmentId: string) =>
    invoke<Manifest>("delete_assignment", { slug, assignmentId }),
  submitAssignment: (slug: string, assignmentId: string, content: string) =>
    invoke<Manifest>("submit_assignment", { slug, assignmentId, content }),
  submitCapstone: (slug: string, content: string) =>
    invoke<Manifest>("submit_capstone", { slug, content }),
  deleteSubject: (slug: string) => invoke<void>("delete_subject", { slug }),
  resetCurriculum: (slug: string) =>
    invoke<Manifest>("reset_curriculum", { slug }),
};
