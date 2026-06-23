import { create } from "zustand";

export type ThemeName =
  | "playful"
  | "playful-dark"
  | "aurelia-dark"
  | "night"
  | "almanac"
  | "momentum";

const KEY = "lyceum-theme";
const THEMES: ThemeName[] = [
  "playful",
  "playful-dark",
  "aurelia-dark",
  "night",
  "almanac",
  "momentum",
];
const DEFAULT_THEME: ThemeName = "playful";

function load(): ThemeName {
  try {
    const v = localStorage.getItem(KEY);
    if (v && (THEMES as string[]).includes(v)) return v as ThemeName;
  } catch {
    /* no localStorage (e.g. SSR/test) */
  }
  return DEFAULT_THEME;
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
