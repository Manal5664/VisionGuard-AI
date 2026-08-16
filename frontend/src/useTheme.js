import { useCallback, useEffect, useState } from "react";

export const THEMES = ["dark", "light", "midnight"];
export const DEFAULT_THEME = "dark";

const STORAGE_KEY = "vg-theme";

const THEME_COLORS = {
  dark: "#0a0e14",
  light: "#f4f6f9",
  midnight: "#0b1220",
};

function readInitialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (THEMES.includes(saved)) return saved;
  } catch {
    // localStorage unavailable — fall through to default
  }
  return DEFAULT_THEME;
}

export default function useTheme() {
  const [theme, setTheme] = useState(readInitialTheme);

  const applyTheme = useCallback((nextTheme) => {
    document.documentElement.setAttribute("data-theme", nextTheme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_COLORS[nextTheme] || THEME_COLORS[DEFAULT_THEME]);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  const changeTheme = useCallback((nextTheme) => {
    if (!THEMES.includes(nextTheme)) return;
    setTheme(nextTheme);
    try {
      localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // Persistence unavailable; the current session still uses the theme.
    }
  }, []);

  return [theme, changeTheme];
}
