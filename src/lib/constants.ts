export const SHOP_NAME = "Barbershop pr' Kljuni";
// Ime platforme - uporabi na splošnih/računskih straneh, ki niso specifične
// za en salon (prijava, registracija, pozabljeno geslo, čakanje na odobritev).
export const PLATFORM_NAME = "Fillio";
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

// Prvi delovni dan po danes (preskoči nedeljo/ponedeljek) - za "Termini za
// jutri" na nadzorni plošči.
export function nextBusinessDayAfterToday(maxLookahead = 14) {
  for (let o = 1; o <= maxLookahead; o++) {
    if (isBusinessDay(todayISO(o))) return todayISO(o);
  }
  return todayISO(1);
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

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "15. - 19. september" (isti mesec) ali "29. september - 3. oktober" (prehod
// čez mesec).
function formatDayRange(startIso: string, endIso: string): string {
  const start = new Date(startIso + "T00:00:00");
  const end = new Date(endIso + "T00:00:00");
  const startMonth = start.toLocaleDateString("sl-SI", { month: "long" });
  const endMonth = end.toLocaleDateString("sl-SI", { month: "long" });

  if (startIso === endIso) {
    return `${start.getDate()}. ${capitalize(startMonth)}`;
  }

  if (startMonth === endMonth) {
    return `${start.getDate()}. - ${end.getDate()}. ${capitalize(endMonth)}`;
  }
  return `${start.getDate()}. ${capitalize(startMonth)} - ${end.getDate()}. ${capitalize(endMonth)}`;
}

// Delovni dnevi (torek-sobota), grupirani po tednih - privzeto ta teden +
// naslednji trije (cca. 4 tedne vnaprej). Pretekli dnevi v tekočem tednu so
// izpuščeni. Oznaka vsake skupine je dejanski datumski razpon tistega bloka
// dni ("Ta teden" ima dodano predpono, ostali imajo samo datume).
export function upcomingBusinessWeeks(weekCount = 4): BusinessWeek[] {
  const today = todayISO();
  const monday = mondayOf(today);

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
      const range = formatDayRange(dates[0], dates[dates.length - 1]);
      weeks.push({ label: w === 0 ? `Ta teden, ${range}` : range, dates });
    }
  }
  return weeks;
}

// ---------------------------------------------------------------------------
// Mesečni koledar (lastnikova nadzorna plošča) - vse spodaj dela z "YYYY-MM".
// ---------------------------------------------------------------------------

export function monthOf(iso: string) {
  return iso.slice(0, 7);
}

export function monthLabel(monthStr: string) {
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("sl-SI", {
    month: "long",
    year: "numeric",
  });
}

export function shiftMonth(monthStr: string, delta: number) {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthRange(monthStr: string): { start: string; end: string } {
  const [y, m] = monthStr.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    start: `${monthStr}-01`,
    end: `${monthStr}-${String(lastDay).padStart(2, "0")}`,
  };
}

// Mreža dni za mesečni koledar, teden se začne s ponedeljkom. `null` = prazna
// celica za poravnavo (dan izven prikazanega meseca).
export function monthGrid(monthStr: string): (string | null)[][] {
  const [y, m] = monthStr.split("-").map(Number);
  const month0 = m - 1;
  const jsFirstWeekday = new Date(y, month0, 1).getDay(); // 0=ned..6=sob
  const leadingBlanks = (jsFirstWeekday + 6) % 7; // pretvori v ponedeljek=0
  const daysInMonth = new Date(y, month0 + 1, 0).getDate();

  const cells: (string | null)[] = new Array(leadingBlanks).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(toISODate(new Date(y, month0, day)));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
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
