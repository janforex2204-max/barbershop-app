"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";

// Majhen, diskreten preklopnik - ikona prikazuje temo, V KATERO preklopiš
// (sonce v temnem načinu, luna v svetlem), dosledno velik povsod, kjer je
// uporabljen (glej klicna mesta: /owner/login, /owner, /[slug]).
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Preklopi na svetlo temo" : "Preklopi na temno temo"}
      title={theme === "dark" ? "Svetla tema" : "Temna tema"}
      className={`inline-flex items-center justify-center p-1.5 rounded-md text-cream-dim hover:text-cream hover:bg-ink-soft cursor-pointer transition-colors ${className}`}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
