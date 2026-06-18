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

export interface WorkspaceInfo {
  root: string;
  subjectCount: number;
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

export interface Manifest {
  subject: string;
  slug: string;
  created: string;
  updated: string;
  scale: { start: number | "test"; target: number };
  current: {
    level: number;
    moduleId?: string;
    phase: string;
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
