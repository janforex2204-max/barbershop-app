export const SHOP_NAME = "Barbershop pr' Kljuni";
// Priprava na več frizerjev (funkcionalnost še ne obstaja) - privzeto ime lastnika.
export const OWNER_NAME = "Žiga Kljun";

export const HOURS = [
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
];

// Vedno formatiraj iz LOKALNIH komponent datuma (leto/mesec/dan), nikoli prek
// toISOString() - ta pretvori v UTC, kar v UTC+ conah (npr. CEST) lokalno
// polnoč premakne na prejšnji dan.
function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return toISODate(d);
}

export function dayLabel(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("sl-SI", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function weekdayOf(iso: string) {
  return new Date(iso + "T00:00:00").getDay();
}

// Salon dela torek-sobota (getDay(): nedelja=0, ponedeljek=1, ..., sobota=6).
export const BUSINESS_WEEKDAYS = [2, 3, 4, 5, 6];

export function isBusinessDay(iso: string) {
  return BUSINESS_WEEKDAYS.includes(weekdayOf(iso));
}

// Vrne offsete (od danes) prvih `count` delovnih dni, npr. za izbiro dneva
// na strani za rezervacije.
export function nextBusinessDayOffsets(count: number, maxLookahead = 21) {
  const offsets: number[] = [];
  for (let o = 0; offsets.length < count && o < maxLookahead; o++) {
    if (isBusinessDay(todayISO(o))) offsets.push(o);
  }
  return offsets;
}

// Ponedeljek tega tedna za dani datum (uporabljeno za grupiranje po tednih).
function mondayOf(iso: string): Date {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export type BusinessWeek = { label: string; dates: string[] };

// Delovni dnevi (torek-sobota), grupirani po tednih - ta teden + naslednja dva.
// Pretekli dnevi v tekočem tednu so izpuščeni.
export function upcomingBusinessWeeks(weekCount = 3): BusinessWeek[] {
  const today = todayISO();
  const monday = mondayOf(today);
  const labels = ["Ta teden", "Naslednji teden", "Čez 2 tedna", "Čez 3 tedne"];

  const weeks: BusinessWeek[] = [];
  for (let w = 0; w < weekCount; w++) {
    const weekMonday = new Date(monday);
    weekMonday.setDate(weekMonday.getDate() + w * 7);

    const dates: string[] = [];
    for (const offset of [1, 2, 3, 4, 5]) {
      const d = new Date(weekMonday);
      d.setDate(d.getDate() + offset);
      const iso = toISODate(d);
      if (iso >= today) dates.push(iso);
    }

    if (dates.length > 0) {
      weeks.push({ label: labels[w] ?? `Čez ${w} tedne`, dates });
    }
  }
  return weeks;
}

// Pretvori lokalno slovensko številko (npr. "040 123 456") v mednarodni
// format brez "+", ki ga zahteva wa.me (npr. "386401234456").
export function toWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("386")) return digits;
  if (digits.startsWith("0")) return "386" + digits.slice(1);
  return digits;
}

export function whatsAppLink(phone: string, message: string): string {
  return `https://wa.me/${toWhatsAppPhone(phone)}?text=${encodeURIComponent(message)}`;
}
