"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";

export type Theme = "light" | "dark";

// Dva LOČENA localStorage ključa - lastniška stran (/owner/*, /moj-urnik/
// [token]) in strankina stran (/[slug], /rezervacija/[token]) sta
// NEODVISNI (glej pogovor s Claude - prej je bil preklop teme na /owner
// spremenil tudi temo na /[slug] v istem brskalniku, ker sta si delili EN
// sam ključ "fillio-theme"). Ista funkcija se uporabi TUKAJ (toggleTheme
// spodaj) IN v layout.tsx-jevem sinhronem init skriptu (dobesedno
// podvojena logika kot niz JS-a, ker ta teče PRED React/uvozi) - obe
// mesti morata ostati usklajeni.
export function themeStorageKeyForPath(pathname: string): string {
  return pathname.startsWith("/owner") || pathname.startsWith("/moj-urnik")
    ? "fillio-theme-owner"
    : "fillio-theme-customer";
}

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
} | null>(null);

// useSyncExternalStore namesto useState+useEffect (glej pogovor s Claude,
// celovita revizija zmogljivosti) - <html data-theme="..."> (preden se
// React sploh naloži) sinhrono nastavi inline <script> v layout.tsx, ki
// prebere localStorage oz. prefers-color-scheme. Prejšnja različica
// (useState(readTheme) - readTheme vrne "dark" na strežniku, a takoj pravo
// vrednost na PRVI odjemalčevi hidraciji) je povzročala React #418
// hydration mismatch, kadar je bila dejanska tema "light" (izmerjeno na
// /owner/employees) - React je zato zavrgel IN PONOVNO izrisal celo
// poddrevo, dodaten nepotreben strošek na vsaki strani s ThemeToggle.
// getServerSnapshot spodaj je namenoma FIKSEN "dark" - useSyncExternalStore
// zagotovi, da GA (ne resnične DOM vrednosti) uporabi tudi za PRVI
// odjemalčev izris, kar se torej UJEMA s strežnikom (ni mismatch) - prava
// vrednost se uveljavi šele pri NASLEDNJEM izrisu (React sam to sproži po
// hidraciji), kratek, neopazen preklop ikone (barve strani same so že
// pravilne od prvega izrisa, ker jih vodi CSS prek data-theme, ne to stanje).
const THEME_CHANGE_EVENT = "fillio-theme-change";

function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}
function getServerSnapshot(): Theme {
  return "dark";
}
function subscribe(onChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
}

function applyTheme(theme: Theme, storageKey: string) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(storageKey, theme);
  } catch {
    // localStorage lahko ni na voljo (zasebno brskanje itd.) - preklop teme
    // naj še vedno deluje za trenutno sejo, samo brez pomnjenja.
  }
  // Sinhrono nastavljen DOM atribut zgoraj ni sam po sebi "reaktiven" - brez
  // tega dogodka useSyncExternalStore ne bi vedel, da naj znova pokliče
  // getSnapshot (edini vgrajeni "subscribe" vir bi bil React sam, ki pa se
  // tu namenoma ne uporablja - toggleTheme spodaj je zunaj React stanja).
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const pathname = usePathname();

  function toggleTheme() {
    applyTheme(theme === "dark" ? "light" : "dark", themeStorageKeyForPath(pathname));
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
