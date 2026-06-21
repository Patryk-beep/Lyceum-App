import { create } from "zustand";

/** Coordinates the whole-window "zen" write mode between `ZenEditor` (which owns the
 *  draft + the portal layer) and `AppShell` (which must hide chrome + suppress the live
 *  drawer while it's up). `available` is flipped on by a mounted `ZenEditor`, so the
 *  global ⌘⇧Z accelerator is a no-op on non-editor routes. `briefOpen` drives the
 *  reference rail; default OPEN (write-while-referencing wins per the research). */
interface ZenState {
  active: boolean;
  briefOpen: boolean;
  available: boolean;
  setActive: (v: boolean) => void;
  toggle: () => void;
  toggleBrief: () => void;
  reset: () => void;
}

export const useZenStore = create<ZenState>((set) => ({
  active: false,
  briefOpen: true,
  available: false,
  setActive: (v) => set({ active: v }),
  toggle: () => set((s) => ({ active: !s.active })),
  toggleBrief: () => set((s) => ({ briefOpen: !s.briefOpen })),
  // ponytail: on unmount the editor surface is gone — drop active/available and
  // re-arm the rail open for the next entry. width-resize persistence deferred.
  reset: () => set({ active: false, available: false, briefOpen: true }),
}));
