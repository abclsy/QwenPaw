import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

/**
 * 2026-10-13 主题定稿：浅色 + 中铁蓝两个主题（用户拍板）。
 * "blue" = 中铁蓝主题（品牌色 #1961AC 基底的深蓝调）。
 * 历史值 "dark" 自动迁移为 "blue"；"system" 映射为浅色。
 */
export type ThemeMode = "blue" | "light" | "system";
export type ResolvedTheme = "blue" | "light";

const THEME_STORAGE_KEY = "crecpaw-theme-mode";

interface ThemeContextValue {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeMode: "light",
  resolvedTheme: "light",
  isDark: false,
  setThemeMode: () => {},
});

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "blue") return "blue";
  // system follows light (dark was retired; blue is an explicit choice)
  return "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "blue" || stored === "light" || stored === "system") {
        return stored;
      }
      if (stored === "dark") {
        return "blue"; // migration: dark theme retired, maps to blue
      }
    }
    return "light";
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(themeMode),
  );

  // Update resolved theme when mode changes
  useEffect(() => {
    setResolvedTheme(resolveTheme(themeMode));
  }, [themeMode]);

  // Apply classes based on resolved theme. 中铁蓝 is a LIGHT-based
  // theme (brand-blue navigation + light content) — it does NOT use
  // the dark-mode rules; only blue-mode drives the blue sidebar layer.
  useEffect(() => {
    document.documentElement.classList.toggle(
      "blue-mode",
      resolvedTheme === "blue",
    );
  }, [resolvedTheme]);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        resolvedTheme,
        isDark: false,
        setThemeMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
