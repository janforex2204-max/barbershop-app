import type { SalonDayHours } from "@/types/database.types";
import {
  isBusinessDay,
  upcomingWeeksMatching,
  nextDayMatching,
  BOOKING_WINDOW_WEEKS,
  type BusinessWeek,
} from "./constants";

// En sam vir resnice za izračun prostih terminov, ki upošteva TRAJANJE
// izbrane storitve - uporabljeno na /[slug] (javna rezervacijska stran) in
// v bookAppointment server actionu (glej [slug]/actions.ts) za ponovno
// preverbo na strežniku, preden se termin dejansko zapiše.
//
// Prej sta booking-page.tsx in manual-booking-form.tsx (lastnikov ročni
// vnos) neodvisno filtrirala fiksno urno mrežo (HOURS) glede na to, kateri
// TOČNI časi so že zasedeni - brez pojma o trajanju, torej je vsak termin
// "zavzel" natanko eno uro, ne glede na dejansko storitev. manual-booking-
// form.tsx TA modul (za zdaj) še ne uporablja - glej pogovor s Claude.

export type BusyInterval = { time: string; durationMinutes: number };
export type DayWindow = { start: string; end: string };

// Vsi kandidatni začetni časi so VEDNO na četrt ure, ne glede na trajanje
// storitve (npr. 15-minutna storitev med 14:00-15:00 prosto ponudi 14:00,
// 14:15, 14:30, 14:45 - ne pa npr. 14:07). Izvožen - uporabljen tudi kot
// najmanjša smiselna "storitev" pri preverbi "ali ima ta dan sploh kaj
// prostega" (glej booking-page.tsx fullyBookedDates), ko storitev še ni
// izbrana - finejše od te mreže ni mogoče preveriti, zato je to najbolj
// duration-neodvisna preverba, ki jo computeFreeSlots sploh lahko da.
export const SLOT_GRANULARITY_MINUTES = 15;

// Uporabljeno, kadar izbrana storitev nima nastavljenega trajanja
// (services.duration_minutes je null) - glej owner/services/page.tsx.
export const DEFAULT_SERVICE_DURATION_MINUTES = 30;

// Uporabljeno za salone, ki so se registrirali PRED uvedbo per-dnevnega
// urnika (salon_owners.hours je null/prazen) - isto okno kot prejšnja trda
// HOURS mreža (09:00-18:00 vsako uro), da se obstoječim živim salonom
// razpoložljivost ne izprazni čez noč.
const DEFAULT_WINDOW: DayWindow = { start: "09:00", end: "19:00" };

// getDay(): 0=nedelja, 1=ponedeljek, ..., 6=sobota - ista konvencija kot
// weekdayOf() v src/lib/constants.ts. Imena se ujemajo z DAYS v
// owner/register/page.tsx (Korak 3 - urejevalnik urnika).
const WEEKDAY_NAMES = [
  "Nedelja",
  "Ponedeljek",
  "Torek",
  "Sreda",
  "Četrtek",
  "Petek",
  "Sobota",
];

// Izvoženo (prej zasebno) - owner/manual-booking-form.tsx ju potrebuje za
// izračun "vrzeli" pri kliku na koledar (glej computeGapMinutes spodaj in
// pogovor s Claude).
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function toHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// null = salon ta dan sploh ne dela (closed: true za ta dan v hours, ali -
// za salone brez nastavljenega hours - ne sodi v prejšnje trdo torek-sobota
// pravilo, glej isBusinessDay v ./constants).
export function resolveDayWindow(
  hours: SalonDayHours[] | null | undefined,
  dateISO: string
): DayWindow | null {
  if (!hours || hours.length === 0) {
    // POMEMBNO: ne vrni DEFAULT_WINDOW za VSAK dan - to bi za stare salone
    // (registrirane PRED uvedbo per-dnevnega urnika) nenadoma "odprlo" tudi
    // nedeljo/ponedeljek, ki ju je prejšnja trda BUSINESS_WEEKDAYS pravilno
    // zapirala (glej DatePicker/manual-booking-form.tsx pred to spremembo).
    return isBusinessDay(dateISO) ? DEFAULT_WINDOW : null;
  }

  const weekday = WEEKDAY_NAMES[new Date(dateISO + "T00:00:00").getDay()];
  const day = hours.find((h) => h.day === weekday);
  if (!day) return isBusinessDay(dateISO) ? DEFAULT_WINDOW : null;
  if (day.closed) return null;
  return { start: day.from, end: day.to };
}

// Isti tedenski/dnevni razpon kot upcomingBusinessWeeks (glej ./constants),
// a dan vključi SAMO, če je dejansko odprt po hours (resolveDayWindow
// zgoraj) - ne po trdem torek-sobota pravilu. Uporabljeno na javni
// rezervacijski strani (booking-page.tsx/date-picker.tsx) in pri
// prenaročanju (rezervacija/[token]/manage-booking-page.tsx), da DatePicker
// dejansko ponudi VSAK dan, ki ga je lastnik (ali zaposleni) odprl - glej
// pogovor s Claude, prej ponedeljek NI bil nikoli izbirljiv, ne glede na to,
// kaj je bilo dejansko nastavljeno v hours.
export function upcomingAvailableWeeks(
  hours: SalonDayHours[] | null | undefined,
  weekCount = BOOKING_WINDOW_WEEKS
): BusinessWeek[] {
  return upcomingWeeksMatching((iso) => resolveDayWindow(hours, iso) !== null, weekCount);
}

// Isti popravek kot upcomingAvailableWeeks zgoraj, za "prvi naslednji odprt
// dan" namesto celega razpona - glej nextBusinessDayAfterToday v
// ./constants (owner/page.tsx "Termini za jutri", glej pogovor s Claude).
export function nextAvailableDayAfterToday(
  hours: SalonDayHours[] | null | undefined,
  maxLookahead = 14
): string {
  return nextDayMatching((iso) => resolveDayWindow(hours, iso) !== null, maxLookahead);
}

// Neobvezen premor (npr. malica) znotraj sicer odprtega dne - glej
// breakFrom/breakTo v SalonDayHours (database.types.ts). null, če dan nima
// premora nastavljenega (ali sploh ni odprt - resolveDayWindow za TA primer
// itak že vrne null, klicatelju v tem primeru premor ni pomemben). Vrnjen
// kot BusyInterval, da ga klicatelj lahko preprosto doda v `busy` seznam
// PRED klicem computeFreeSlots/isSlotAvailable - overlaps() spodaj ne loči
// med "resnično zasedenim" in premorom, zato ni potrebna nobena sprememba v
// sami logiki izračuna, samo en dodaten vnos v seznamu (glej klicna mesta v
// [slug]/actions.ts, [slug]/booking-page.tsx, owner/actions.ts,
// owner/manual-booking-form.tsx, rezervacija/[token]/actions.ts,
// rezervacija/[token]/manage-booking-page.tsx).
export function resolveDayBreak(
  hours: SalonDayHours[] | null | undefined,
  dateISO: string
): BusyInterval | null {
  if (!hours || hours.length === 0) return null;

  const weekday = WEEKDAY_NAMES[new Date(dateISO + "T00:00:00").getDay()];
  const day = hours.find((h) => h.day === weekday);
  if (!day || day.closed || !day.breakFrom || !day.breakTo) return null;

  const start = toMinutes(day.breakFrom);
  const end = toMinutes(day.breakTo);
  if (end <= start) return null;

  return { time: day.breakFrom, durationMinutes: end - start };
}

function overlaps(
  candidateStart: number,
  candidateEnd: number,
  busy: BusyInterval[]
): boolean {
  return busy.some((b) => {
    const busyStart = toMinutes(b.time);
    const busyEnd = busyStart + b.durationMinutes;
    return candidateStart < busyEnd && candidateEnd > busyStart;
  });
}

// Vrne VSE proste začetne čase (HH:MM) za dano storitev - kandidat je prost
// SAMO, če se [candidate, candidate+trajanje) v celoti prilega med window in
// se ne prekriva z NOBENIM zasedenim intervalom.
export function computeFreeSlots(
  window: DayWindow | null,
  busy: BusyInterval[],
  serviceDurationMinutes: number
): string[] {
  if (!window) return [];

  const dayStart = toMinutes(window.start);
  const dayEnd = toMinutes(window.end);
  const slots: string[] = [];

  for (
    let start = dayStart;
    start + serviceDurationMinutes <= dayEnd;
    start += SLOT_GRANULARITY_MINUTES
  ) {
    const end = start + serviceDurationMinutes;
    if (!overlaps(start, end, busy)) slots.push(toHHMM(start));
  }

  return slots;
}

// Razpoložljiva "vrzel" OD danega časa naprej, v minutah - do naslednjega
// zasedenega intervala/premora ALI konca delovnika, karkoli pride prej.
// Uporabljeno na /owner (klik na prosto uro v tedenskem/dnevnem koledarju,
// glej pogovor s Claude - manual-booking-form.tsx) za takojšen prikaz,
// katere storitve se dejansko prilegajo na TO točko, brez ročnega računanja
// med telefonskim klicem. null, če dan sploh ni odprt; 0, če je `fromTime`
// že na/izven roba delovnika (npr. konec delovnika).
export function computeGapMinutes(
  window: DayWindow | null,
  busy: BusyInterval[],
  fromTime: string
): number | null {
  if (!window) return null;

  const from = toMinutes(fromTime);
  const dayEnd = toMinutes(window.end);
  if (from >= dayEnd) return 0;

  let boundary = dayEnd;
  for (const b of busy) {
    const busyStart = toMinutes(b.time);
    const busyEnd = busyStart + b.durationMinutes;
    // `fromTime` pade ZNOTRAJ tega že tekočega zasedenega intervala - prave
    // vrzeli sploh ni (zaokroževanje klika na koledarju na četrt ure ga je
    // lahko potisnilo tik ob/v obstoječ termin, glej pogovor s Claude -
    // brez tega bi spodnja zanka ta interval preprosto preskočila, saj
    // busyStart < from, in vrzel bi bila napačno izračunana do NASLEDNJEGA
    // (bolj oddaljenega) termina).
    if (busyStart <= from && busyEnd > from) return 0;
    if (busyStart >= from && busyStart < boundary) boundary = busyStart;
  }
  return boundary - from;
}

// Enaka logika kot computeFreeSlots, a za EN konkreten že izbran čas - glej
// bookAppointment v [slug]/actions.ts, ki tega NE sme samo zaupati klientu
// (client je lahko zastarel, ali termin medtem zaseden), ampak mora tik pred
// vpisom ponovno preveriti na strežniku.
export function isSlotAvailable(
  window: DayWindow | null,
  busy: BusyInterval[],
  serviceDurationMinutes: number,
  candidateTime: string
): boolean {
  if (!window) return false;

  const start = toMinutes(candidateTime);
  const end = start + serviceDurationMinutes;
  if (start < toMinutes(window.start) || end > toMinutes(window.end)) return false;

  return !overlaps(start, end, busy);
}
