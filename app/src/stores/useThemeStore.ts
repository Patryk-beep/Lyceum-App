import { create } from "zustand";

export type ThemeName = "night" | "almanac" | "momentum";

const KEY = "lyceum-theme";

function load(): ThemeName {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "night" || v === "almanac" || v === "momentum") return v;
  } catch {
    /* no localStorage (e.g. SSR/test) */
  }
  return "night";
}

interface ThemeState {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: load(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* ignore */
    }
    set({ theme });
  },
}));
