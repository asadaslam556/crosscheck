import { useEffect, useState } from "react";

export type Theme = "system" | "light" | "dark";
const KEY = "crosscheck-theme";

function stored(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

/** The chosen theme lives on <html data-theme>; "system" removes it and lets CSS follow the OS. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(stored);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Private windows can refuse storage. The theme still applies for this visit.
    }
  }, [theme]);

  const next: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
  return { theme, cycle: () => setTheme(next[theme]) };
}
