import type { SalonDayHours } from "@/types/database.types";

// Brez "use client" NAMENOMA - čist podatek/logika, brez React kljuk/DOM-a,
// zato ga lahko kliče TAKO client koda (DayHoursEditor uporabniki) KOT
// server koda (owner/employees-actions.ts addEmployee, ki nov urnik seed-a
// s tem, če salon nima veljavnega hours). Prvotno je bilo to definirano
// znotraj day-hours-editor.tsx ("use client") - klic od tam iz server
// action-a je vrgel "Attempted to call defaultHours() from the server but
// defaultHours is on the client" (glej pogovor s Claude), zato je
// premaknjeno sem; day-hours-editor.tsx ga zdaj samo re-exporta za nazaj
// združljivost obstoječih (client-side) uvozov.
export const DAYS = [
  "Ponedeljek",
  "Torek",
  "Sreda",
  "Četrtek",
  "Petek",
  "Sobota",
  "Nedelja",
];

// Privzet urnik za nov salon (registracijski wizard) IN novega zaposlenega
// brez veljavnega salonovega urnika za seed (owner/employees-actions.ts) -
// torek-sobota odprto, nedelja/ponedeljek zaprto, brez premora.
export function defaultHours(): SalonDayHours[] {
  return DAYS.map((day) => {
    if (day === "Nedelja") return { day, closed: true, from: "09:00", to: "19:00" };
    if (day === "Sobota") return { day, closed: false, from: "09:00", to: "13:00" };
    return { day, closed: false, from: "09:00", to: "19:00" };
  });
}
