// Hand-authored mirrors of the Rust DTOs (camelCase on the wire). A Vitest parity
// test pins the golden fixture's shape; ts-rs codegen replaces these in M2.

export interface SubjectSummary {
  slug: string;
  subject: string;
  level: number;
  target: number;
  status: string;
  phase: string;
  modulesTotal: number;
  modulesMastered: number;
  meanMastery: number | null;
  reviewsDue: number;
  nextAction: string;
  updated: string;
}

export interface RouteDto {
  kind: string;
  why: string;
  target: string | null;
}

export interface GradePreview {
  again: number;
  hard: number;
  good: number;
  easy: number;
}

export interface ReviewCandidate {
  itemId: string;
  prompt: string;
  answer: string;
  moduleId: string | null;
  boxNum: number | null;
  preview: GradePreview;
}

export type ReviewGrade = "again" | "hard" | "good" | "easy";

export interface StepDto {
  ranTurn: boolean;
  ok: boolean;
  validationErrors: string[];
  manifest: Manifest | null;
  nextAction: string;
}

export interface AnalyticsReport {
  subject: string;
  level: number;
  target: number;
  modulesTotal: number;
  modulesMastered: number;
  overallMastery: number | null;
  calibration: { predictions: number; hits: number; accuracy: number | null };
  modules: {
    moduleId: string;
    title: string;
    level: number;
    status: string;
    meanMastery: number | null;
  }[];
  heatmap: { moduleId: string; objectiveId: string; mastery: number | null }[];
  review: { total: number; due: number; retired: number; lapses: number };
  history: { date: string; skill: string; event: string; result: string }[];
}

/** One question in the interactive placement run (skill-owned `placement-state.json`). */
export interface PlacementQuestion {
  id: string;
  tier?: number;
  question: string;
}

export interface PlacementHistoryItem {
  id: string;
  question: string;
  answer: string;
  verdict: string; // "correct" | "partial" | "incorrect"
  feedback: string;
}

/** The skill-owned `placement-state.json` the app reads to render the test. The app
 *  never writes this — it writes the learner's answer to `placement-answer.json` and
 *  commits the level (from `recommendedLevel`) via `placement_finalize` when `done`. */
export interface PlacementState {
  asked: number;
  maxQuestions: number;
  current: PlacementQuestion | null;
  lastFeedback: string | null;
  history: PlacementHistoryItem[];
  done: boolean;
  recommendedLevel: number | null;
  rationale: string | null;
}

export interface StreakInfo {
  current: number;
  longest: number;
  lastActive: string | null;
}

export interface WorkspaceInfo {
  root: string;
  subjectCount: number;
}

export interface PreflightReport {
  claudeFound: boolean;
  pluginStaged: boolean;
  ready: boolean;
  error: string | null;
  claudePath: string | null;
}

export interface DoctorReport {
  ok: boolean;
  apiKeySource: string | null;
  mcpServersEmpty: boolean;
  lyceumSkills: string[];
  pluginOk: boolean;
  resultOk: boolean;
  sessionId: string | null;
  notes: string[];
}

// Mirrors lyceum_engine::BridgeEvent (serde tag "kind", content "data", camelCase).
export type BridgeEvent =
  | {
      kind: "sessionInit";
      data: {
        sessionId: string;
        model: string | null;
        apiKeySource: string | null;
        mcpServersEmpty: boolean;
        lyceumSkills: string[];
        pluginOk: boolean;
      };
    }
  | { kind: "authWarning"; data: { source: string } }
  | { kind: "turnStarted"; data: { turnId: number } }
  | { kind: "textDelta"; data: { turnId: number; block: number; text: string } }
  | { kind: "thinkingDelta"; data: { turnId: number; block: number; text: string } }
  | {
      kind: "toolUseStart";
      data: { turnId: number; block: number; toolId: string; name: string };
    }
  | {
      kind: "toolUseEnd";
      data: { turnId: number; block: number; toolId: string; name: string };
    }
  | {
      kind: "turnResult";
      data: {
        turnId: number;
        ok: boolean;
        stopReason: string | null;
        text: string;
        costUsdListPrice: number;
      };
    }
  | { kind: "milestone"; data: { phase: string } }
  | { kind: "warning"; data: { message: string } }
  | { kind: "fatal"; data: { kind: string; message: string } };

/** Mirrors the Rust `SessionEnvelope` — a `BridgeEvent` tagged with its subject slug
 *  so the webview can key live run-state per subject. */
export interface SessionEnvelope {
  slug: string;
  event: BridgeEvent;
}

// --- Tutor (read-only in-context Q&A; streams on the `claude://tutor` channel) ---

export interface TutorMessage {
  role: "user" | "assistant";
  text: string;
}

/** The app-owned visible Q&A transcript (`tutor-thread.json`). */
export interface TutorThread {
  turns: TutorMessage[];
}

/** What the learner is currently viewing — passed to `ask_tutor` so the tutor answers about
 *  the specific thing they're working on (always also has the full research). */
export interface TutorScope {
  artifact?: string;
  moduleId?: string;
}

/** Mirrors the Rust `TutorEnvelope` — a `BridgeEvent` on the dedicated tutor channel. */
export interface TutorEnvelope {
  slug: string;
  event: BridgeEvent;
}

// --- Notebook (app-owned Markdown notes; never touches the manifest) ---

/** A single note — mirror of the Rust `NotebookEntry` (camelCase wire keys, dates
 *  as ISO `YYYY-MM-DD` strings). `moduleId` anchors the note to a lesson's module. */
export interface NotebookEntry {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  moduleId?: string;
  tags: string[];
}

// --- Partial manifest shape (enough for views; full type arrives with ts-rs). ---

export interface Objective {
  id: string;
  text: string;
  bloom?: string;
  mastery?: number;
  attempts?: number;
  lastAssessed?: string;
}

export interface Module {
  id: string;
  title: string;
  level: number;
  prereqs: string[];
  status: "locked" | "available" | "in-progress" | "mastered";
  taught: boolean;
  masteryThreshold: number;
  objectives: Objective[];
}

/** The hand-in widget a skill can request for an assignment. */
export type InputType = "text" | "markdown" | "code" | "file" | "choice";

export interface Assignment {
  id: string;
  moduleId: string;
  // Wire key is `type` (Rust serde-renames `kind` -> `type`), NOT `kind`.
  type: string;
  file: string;
  objectives: string[];
  status: "open" | "submitted" | "graded";
  // Hand-in metadata (optional; absent on older manifests). The app defaults a
  // missing `inputType` to "markdown".
  inputType?: InputType;
  options?: string[];
  language?: string;
  submissionFile?: string;
  submittedAt?: string;
}

export interface Manifest {
  subject: string;
  slug: string;
  created: string;
  updated: string;
  scale: { start: number | "test"; target: number };
  current: {
    // `level` and `phase` are omitted from the wire when null (a freshly-created
    // subject has no phase yet; a "test" start has no level until placement).
    level?: number;
    moduleId?: string;
    phase?: string;
    status: string;
  };
  modules: Module[];
  assignments: Assignment[];
  reviewQueue: ReviewItem[];
  [key: string]: unknown;
}

/** A row in the lessons/ directory, enriched with its module (by NN prefix). */
export interface LessonEntry {
  file: string;
  moduleId: string | null;
  moduleStatus: string | null;
  title: string | null;
}

export interface DeleteLessonResult {
  manifest: Manifest;
  /** Whether the taught flip actually armed a re-teach. */
  reopened: boolean;
}

export interface ReviewItem {
  itemId: string;
  prompt: string;
  answer: string;
  moduleId?: string;
  box: number | "retired";
  due: string;
  lastResult?: "pass" | "fail";
  lapses: number;
}
