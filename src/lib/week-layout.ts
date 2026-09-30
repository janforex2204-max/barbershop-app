import { resolveDayWindow } from "./availability";
import type { SalonDayHours } from "@/types/database.types";

export type WeekAppointment = {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  durationMinutes: number;
  customerName: string;
  service: string;
  employeeId: string | null;
  // Kratka INTERNA opomba lastnika (glej owner/week-calendar.tsx) - NIKOLI
  // prikazana strankam (glej supabase/schema.sql).
  ownerNote: string | null;
};

export type WeekCalendarEmployee = {
  id: string;
  name: string;
  hours: SalonDayHours[];
  color: string | null;
  photo_url: string | null;
};

// Deljeno med week-calendar.tsx (dnevi-kot-stolpci) IN day-employee-
// columns.tsx (zaposleni-kot-stolpci, glej pogovor s Claude, item 3) - ISTA
// gostota/gutter/min-višina na obeh, da postavitvi vizualno ne razhajata.
// Tu, NE v week-calendar.tsx, da se izogne kroženemu uvozu (week-calendar
// uvozi DayEmployeeColumns, DayEmployeeColumns bi sicer uvozil nazaj iz
// week-calendar).
export const PX_PER_MINUTE = 1.05;
// 34 -> 52: blok zdaj prikazuje ČASOVNI RAZPON + ime + storitev (storitev se
// lahko prelomi v 2 vrstici namesto odreza, glej calendar-block.tsx) - 34px
// je zadoščalo za 3 vrstice, a je storitev v 2. vrstici ob kratkih terminih
// obrezalo (glej pogovor s Claude, "besedilo storitve se odrezuje").
export const MIN_BLOCK_HEIGHT = 52;
export const TIME_GUTTER_PX = 44;

export function formatHourLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  return `${String(h).padStart(2, "0")}:00`;
}

// Za razliko od formatHourLabel (zaokroži na uro, za urne oznake mreže) -
// TOČEN čas termina (npr. "11:00–11:45"), izrisan NEPOSREDNO na bloku
// (calendar-block.tsx) - navpična pozicija/višina bloka sama po sebi ni
// dovolj natančna za oceno točne ure (vzorec kot Fresha, glej pogovor s
// Claude).
export function formatTimeRange(startMinutes: number, endMinutes: number): string {
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return `${fmt(startMinutes)}–${fmt(endMinutes)}`;
}

// Deljena paleta za owner/week-calendar.tsx (prikaz) IN
// owner/employees/employee-color-picker.tsx (izbira) - glej --color-cal-*
// v globals.css (konstantne, ne obrnejo se s temo). Zaposleni izbere ENO od
// TEH ("var(--color-cal-3)" ipd., shranjeno dobesedno v employees.color) -
// "none" NI del izbire, samo interni privzetek za nedodeljene termine.
export const EMPLOYEE_COLOR_PALETTE = [
  "var(--color-cal-1)",
  "var(--color-cal-2)",
  "var(--color-cal-3)",
  "var(--color-cal-4)",
  "var(--color-cal-5)",
  "var(--color-cal-6)",
];

// Barva termina - najprej zaposlenega LASTNA izbira (employees.color), če
// je nastavljena; sicer star ciklični razpored po sort_order (nazaj
// združljivo - obstoječi zaposleni, ki si (še) ni izbral barve, ne "skoči"
// na nepričakovano barvo). employeeId null (ni dodeljen) vedno nevtralna
// --color-cal-none, ne del cikla/izbire.
export function resolveEmployeeColor(
  employeeId: string | null,
  employees: { id: string; color: string | null }[]
): string {
  if (!employeeId) return "var(--color-cal-none)";
  const index = employees.findIndex((e) => e.id === employeeId);
  if (index === -1) return "var(--color-cal-none)";
  const chosen = employees[index].color;
  return chosen ?? EMPLOYEE_COLOR_PALETTE[index % EMPLOYEE_COLOR_PALETTE.length];
}

export type LaidOutAppointment = WeekAppointment & {
  startMinutes: number;
  endMinutes: number;
  // Vodoravni "stolpec" znotraj TE dnevne kolone (0-based) in koliko jih
  // skupaj potrebuje TA prekrivajoča se skupina - glej layoutDayAppointments
  // spodaj. Blok širine 100%/laneCount, odmaknjen lane*(100%/laneCount).
  lane: number;
  laneCount: number;
};

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Standarden "koledarski stolpec" algoritem za prekrivajoče se termine (isti
// vzorec kot Google Calendar/Topsi) - termini, ki se NE prekrivajo (niti
// posredno, prek verige drugih), dobijo polno širino; SKUPINA prekrivajočih
// si širino enakomerno razdeli. NAMENOMA po posameznih skupinah (ne en sam
// globalen laneCount za cel dan) - osamljen pozni termin naj ne bo ozek samo
// zato, ker je zjutraj obstajala (ločena, že končana) skupina treh
// prekrivajočih.
//
// Vhod naj bo že filtriran na EN dan (glej owner/week-calendar.tsx, ki to
// kliče enkrat na dan v tednu) - časi/trajanja med različnimi dnevi niso
// primerljivi.
export function layoutDayAppointments(appointments: WeekAppointment[]): LaidOutAppointment[] {
  const withMinutes = appointments
    .map((a) => {
      const startMinutes = toMinutes(a.time);
      return { ...a, startMinutes, endMinutes: startMinutes + a.durationMinutes };
    })
    .sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes);

  const result: LaidOutAppointment[] = [];
  let active: { endMinutes: number; lane: number }[] = [];
  let cluster: { appt: (typeof withMinutes)[number]; lane: number }[] = [];

  function finalizeCluster() {
    if (cluster.length === 0) return;
    const laneCount = Math.max(...cluster.map((c) => c.lane)) + 1;
    for (const c of cluster) {
      result.push({ ...c.appt, lane: c.lane, laneCount });
    }
    cluster = [];
  }

  for (const appt of withMinutes) {
    // Lane-i, katerih prejšnji zaseden termin je ŽE končan (<=, ne <, - dva
    // termina nazaj-na-nazaj ob isti minuti se NE prekrivata), se sprostijo.
    active = active.filter((a) => a.endMinutes > appt.startMinutes);
    // Prazen "active" pomeni pravo vrzel v dnevu - trenutna skupina je
    // dokončno zaključena, začni novo.
    if (active.length === 0) finalizeCluster();

    const usedLanes = new Set(active.map((a) => a.lane));
    let lane = 0;
    while (usedLanes.has(lane)) lane++;

    active.push({ endMinutes: appt.endMinutes, lane });
    cluster.push({ appt, lane });
  }
  finalizeCluster();

  return result;
}

// Razpon ur, ki jih mreža prikaže (glej owner/week-calendar.tsx) - unija
// odprtih ur VSEH (aktivnih) zaposlenih (ali salon_owners.hours za salone
// brez zaposlenih) čez cel prikazan teden, zaokrožena na polno uro. Termini
// LAHKO obstajajo izven trenutno nastavljenih ur (urnik se je spremenil PO
// rezervaciji) - razpon se v tem primeru razširi, da noben termin ni
// obrezan/skrit.
export function computeWeekHourRange(
  dates: string[],
  hoursSources: SalonDayHours[][],
  appointments: WeekAppointment[]
): { startMinutes: number; endMinutes: number } {
  const windows: { start: string; end: string }[] = [];
  for (const date of dates) {
    for (const hours of hoursSources) {
      const w = resolveDayWindow(hours, date);
      if (w) windows.push(w);
    }
  }

  const DEFAULT_START = 9 * 60;
  const DEFAULT_END = 19 * 60;
  let startMinutes = windows.length > 0 ? Math.min(...windows.map((w) => toMinutes(w.start))) : DEFAULT_START;
  let endMinutes = windows.length > 0 ? Math.max(...windows.map((w) => toMinutes(w.end))) : DEFAULT_END;

  for (const appt of appointments) {
    const s = toMinutes(appt.time);
    const e = s + appt.durationMinutes;
    if (s < startMinutes) startMinutes = s;
    if (e > endMinutes) endMinutes = e;
  }

  startMinutes = Math.floor(startMinutes / 60) * 60;
  endMinutes = Math.ceil(endMinutes / 60) * 60;
  if (endMinutes <= startMinutes) endMinutes = startMinutes + 60;

  return { startMinutes, endMinutes };
}
