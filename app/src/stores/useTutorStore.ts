import { create } from "zustand";

import type { BridgeEvent, TutorMessage } from "../lib/types";

/** One subject's tutor conversation. `streaming` is the in-flight assistant answer being
 *  built from `textDelta`s; `busy` is true between a question and its terminal event. */
export interface TutorSlugState {
  messages: TutorMessage[];
  streaming: string;
  busy: boolean;
}

const EMPTY: TutorSlugState = { messages: [], streaming: "", busy: false };

interface TutorStore {
  /** Panel visibility (app-global; the panel itself is per-current-subject). */
  open: boolean;
  threads: Record<string, TutorSlugState>;
  openPanel: () => void;
  closePanel: () => void;
  toggle: () => void;
  /** Optimistically record the learner's question and mark the thread busy. */
  ask: (slug: string, question: string) => void;
  /** Reduce a streamed tutor `BridgeEvent` into the thread. */
  apply: (slug: string, ev: BridgeEvent) => void;
  /** Finalize from the mutation result (fallback when no live stream, e.g. browser preview).
   *  No-ops if a terminal stream event already finalized (idempotent). */
  finish: (slug: string, text: string) => void;
  fail: (slug: string, message: string) => void;
  /** Seed scrollback from the persisted thread; never clobbers an active/non-empty thread. */
  loadThread: (slug: string, messages: TutorMessage[]) => void;
  reset: (slug: string) => void;
}

const put = (
  s: TutorStore,
  slug: string,
  next: TutorSlugState,
): Pick<TutorStore, "threads"> => ({ threads: { ...s.threads, [slug]: next } });

export const useTutorStore = create<TutorStore>((set) => ({
  open: false,
  threads: {},
  openPanel: () => set({ open: true }),
  closePanel: () => set({ open: false }),
  toggle: () => set((s) => ({ open: !s.open })),

  ask: (slug, question) =>
    set((s) => {
      const t = s.threads[slug] ?? EMPTY;
      return put(s, slug, {
        messages: [...t.messages, { role: "user", text: question }],
        streaming: "",
        busy: true,
      });
    }),

  apply: (slug, ev) =>
    set((s) => {
      const t = s.threads[slug] ?? EMPTY;
      // Only a thread with a question in flight reacts to stream events; this also makes the
      // terminal event idempotent vs the mutation's `finish` (whichever lands first wins).
      if (!t.busy) return {};
      switch (ev.kind) {
        case "textDelta":
          return put(s, slug, { ...t, streaming: t.streaming + ev.data.text });
        case "turnResult": {
          const text = ev.data.text || t.streaming;
          const answer = ev.data.ok
            ? text
            : text || "(the tutor turn ended with an error)";
          return put(s, slug, {
            messages: [...t.messages, { role: "assistant", text: answer }],
            streaming: "",
            busy: false,
          });
        }
        case "fatal":
          return put(s, slug, {
            messages: [
              ...t.messages,
              { role: "assistant", text: `(tutor error: ${ev.data.message})` },
            ],
            streaming: "",
            busy: false,
          });
        default:
          return {};
      }
    }),

  finish: (slug, text) =>
    set((s) => {
      const t = s.threads[slug] ?? EMPTY;
      if (!t.busy) return {}; // a stream event already finalized
      return put(s, slug, {
        messages: [...t.messages, { role: "assistant", text: text || t.streaming }],
        streaming: "",
        busy: false,
      });
    }),

  fail: (slug, message) =>
    set((s) => {
      const t = s.threads[slug] ?? EMPTY;
      if (!t.busy) return {};
      return put(s, slug, {
        messages: [...t.messages, { role: "assistant", text: message }],
        streaming: "",
        busy: false,
      });
    }),

  loadThread: (slug, messages) =>
    set((s) => {
      const t = s.threads[slug];
      if (t && (t.busy || t.messages.length)) return {}; // don't clobber an active thread
      return put(s, slug, { messages, streaming: "", busy: false });
    }),

  reset: (slug) => set((s) => put(s, slug, { ...EMPTY })),
}));

/** This subject's tutor thread (EMPTY when it has none / slug is null). */
export function useTutorThread(slug: string | null | undefined): TutorSlugState {
  return useTutorStore((s) => (slug ? (s.threads[slug] ?? EMPTY) : EMPTY));
}
