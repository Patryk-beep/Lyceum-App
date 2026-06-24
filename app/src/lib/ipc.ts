import { invoke } from "@tauri-apps/api/core";

import type {
  AnalyticsReport,
  DeleteLessonResult,
  LessonEntry,
  Manifest,
  NotebookEntry,
  ReviewCandidate,
  ReviewGrade,
  RouteDto,
  StepDto,
  StreakInfo,
  SubjectSummary,
  TutorScope,
  TutorThread,
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
  // Interactive placement: the app hands in the learner's typed answer; the next
  // engine step grades it. The level is committed via placementFinalize when done.
  submitPlacementAnswer: (slug: string, id: string, answer: string) =>
    invoke<void>("submit_placement_answer", { slug, id, answer }),
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
  // Tutor: a read-only in-context question. Streams on `claude://tutor`; resolves with the
  // final answer text. Never advances curriculum state.
  askTutor: (slug: string, question: string, scope: TutorScope) =>
    invoke<string>("ask_tutor", { slug, question, scope }),
  readTutorThread: (slug: string) =>
    invoke<TutorThread>("read_tutor_thread", { slug }),
  clearTutorThread: (slug: string) =>
    invoke<void>("clear_tutor_thread", { slug }),
  // Notebook: app-owned Markdown notes (never touch the manifest). `moduleId`
  // anchors a note to the current lesson's module; omit it for a free note.
  listNotebooks: (slug: string) =>
    invoke<NotebookEntry[]>("list_notebooks", { slug }),
  readNotebook: (slug: string, id: string) =>
    invoke<NotebookEntry>("read_notebook", { slug, id }),
  createNotebook: (
    slug: string,
    title: string,
    content: string,
    moduleId?: string,
  ) => invoke<NotebookEntry>("create_notebook", { slug, title, content, moduleId }),
  updateNotebook: (slug: string, id: string, title: string, content: string) =>
    invoke<NotebookEntry>("update_notebook", { slug, id, title, content }),
  deleteNotebook: (slug: string, id: string) =>
    invoke<void>("delete_notebook", { slug, id }),
  // Notebook flashcards: cloze (==answer==) cards scheduled in a SEPARATE store
  // (never manifest.review_queue). `moduleId` scopes due cards to one lesson.
  notebookReviewDue: (slug: string, moduleId?: string) =>
    invoke<ReviewCandidate[]>("notebook_review_due", { slug, moduleId }),
  notebookDueCount: (slug: string) =>
    invoke<number>("notebook_due_count", { slug }),
  notebookReviewGrade: (slug: string, cardId: string, grade: ReviewGrade) =>
    invoke<ReviewCandidate[]>("notebook_review_grade", { slug, cardId, grade }),
  // Read-only AI assist over a note. Returns an editable suggestion text the learner
  // accepts or rejects (never auto-applied). mode: flashcards|summarize|related|tags.
  notebookAssist: (slug: string, mode: string, content: string) =>
    invoke<string>("notebook_assist", { slug, mode, content }),
};
