import { useEffect } from "react";

export type ThemeName = "night" | "almanac" | "momentum";

/** Sets `data-theme` on <html>. Night is the single global default (M0). */
export function ThemeProvider({
  theme = "night",
  children,
}: {
  theme?: ThemeName;
  children: React.ReactNode;
}) {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  return <>{children}</>;
}
