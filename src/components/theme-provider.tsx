"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "fillio-theme";

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
} | null>(null);

// Bere trenutno stanje IZ <html data-theme="...">, ki ga (preden se React
// sploh naloži) sinhrono nastavi inline <script> v layout.tsx - ta prebere
// localStorage oz. prefers-color-scheme. Tako se tu NE podvaja ta logika in
// ni "flash" napačne teme ob nalaganju.
function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // localStorage lahko ni na voljo (zasebno brskanje itd.) - preklop
      // teme naj še vedno deluje za trenutno sejo, samo brez pomnjenja.
    }
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme se lahko uporabi samo znotraj ThemeProvider");
  return ctx;
}
