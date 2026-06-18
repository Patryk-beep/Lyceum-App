import { useEffect } from "react";

import { useThemeStore } from "../stores/useThemeStore";

/** Sets `data-theme` on <html> from the theme store. Alternate themes drop in by
 * filling the same token contract under their own `[data-theme]` selector. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  return <>{children}</>;
}
