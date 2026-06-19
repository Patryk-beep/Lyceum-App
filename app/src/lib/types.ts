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

export interface PlacementItem {
  id: string;
  tier: number;
  stem: string;
  scoringKey: string;
  type: string;
}

export interface PlacementPool {
  items: PlacementItem[];
}

export interface PlacementState {
  done: boolean;
  nextTier: number | null;
  recommendedLevel: number | null;
  asked: number;
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
  | { kind: "warning"; data: { message: string } }
  | { kind: "fatal"; data: { kind: string; message: string } };

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
  reviewQueue: ReviewItem[];
  [key: string]: unknown;
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
