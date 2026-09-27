"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";

// Majhen, diskreten preklopnik - ikona prikazuje temo, V KATERO preklopiš
// (sonce v temnem načinu, luna v svetlem), privzeto dosledno velik povsod,
// kjer je uporabljen (glej klicna mesta: /owner/login, /owner, /[slug]).
// `size` je izjema - na /owner v desnem stolpcu glave (glej owner/page.tsx)
// je namerno večji, da je preklop na prvi pogled očitno klikljiv gumb, ne
// dekoracija.
export default function ThemeToggle({
  className = "",
  size = 16,
}: {
  className?: string;
  size?: number;
}) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Preklopi na svetlo temo" : "Preklopi na temno temo"}
      title={theme === "dark" ? "Svetla tema" : "Temna tema"}
      className={`inline-flex items-center justify-center p-1.5 rounded-md text-cream-dim hover:text-cream hover:bg-ink-soft cursor-pointer transition-colors ${className}`}
    >
      {theme === "dark" ? <Sun size={size} /> : <Moon size={size} />}
    </button>
  );
}
