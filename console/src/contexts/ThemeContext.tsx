import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export type ResolvedTheme = "dark";

interface ThemeContextValue {
  /** Always dark */
  isDark: boolean;
  setThemeMode: () => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark: true,
  setThemeMode: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark] = useState<boolean>(true);

  useEffect(() => {
    document.documentElement.classList.add("dark-mode");
  }, []);

  const setThemeMode = useCallback(() => {
    // no-op: always dark
  }, []);

  const toggleTheme = useCallback(() => {
    // no-op: always dark
  }, []);

  return (
    <ThemeContext.Provider value={{ isDark, setThemeMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
