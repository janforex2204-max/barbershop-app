// Ime platforme - uporabi na splošnih/računskih straneh, ki niso specifične
// za en salon (prijava, registracija, pozabljeno geslo, čakanje na odobritev).
// Ime KONKRETNEGA salona ni več globalna konstanta - vsak salon ima svoje
// (salon_owners.salon_name), razrešeno glede na prijavljenega uporabnika
// (/owner) ali /[slug] iz URL-ja (javna rezervacijska stran).
export const PLATFORM_NAME = "Fillio";
// Kanonična produkcijska domena - uporabi za povezave v emailih (admin
// odobritev), kjer mora povezava vedno kazati na pravo domeno, ne na
// localhost, ne glede na okolje, iz katerega je bila sprožena.
export const PLATFORM_URL = "https://fillio.si";
// Po kolikšnem času preneha veljati povezava za odobritev novega lastnika
// (glej src/app/admin/approve/route.ts).
export const APPROVAL_TOKEN_EXPIRY_DAYS = 5;

// Izbira barvne teme glede na salon_owners.category (glej data-theme="spa" v
// globals.css). "category" je vedno ena od TOČNO treh vrednosti, ki jih
// wizard zapiše (glej categoryDisplay v owner/register/page.tsx: "Frizerski
// salon" | "Kozmetični salon" | "Druga dejavnost") ali null za salone,
// registrirane pred to funkcionalnostjo. Za "Druga dejavnost"/null
// namenoma undefined (obstoječa temna ink/cream tema) - spa paleta je
// vizualno preveč specifično vezana na kozmetiko, da bi bila smiseln
// splošen privzetek za poljubno "drugo" dejavnost (glej pogovor s Claude).
export function resolveSalonTheme(category: string | null | undefined): "spa" | undefined {
  return category === "Kozmetični salon" ? "spa" : undefined;
}

// Koliko delovnih tednov vnaprej lahko stranka rezervira na /[slug] (glej
// upcomingBusinessWeeks spodaj) - namenoma trda omejitev, v nasprotju z
// lastnikovim mesečnim koledarjem na /owner (month-calendar.tsx), ki meje
// NIMA (shiftMonth je čista datumska aritmetika, gre v neskončnost).
export const BOOKING_WINDOW_WEEKS = 4;

// Format cene v EUR - VEDNO 2 decimalki, sl-SI konvencija (vejica, presledek
// pred €: "15,00 €") - dosledno s slovenskimi ceniki/računi. Namenoma vedno 2
// decimalki tudi za cele zneske ("15,00 €", ne "15 €"), da je jasno prikazana
// CELOTNA cena, ne prikrajšana/zaokrožena. Klicatelj naj funkcijo pokliče
// SAMO, če je cena nastavljena (price je null ALI 0 pomeni "lastnik cene še
// ni nastavil" - glej booking-page.tsx in owner/services-manager.tsx, kjer se
// v tem primeru prikaže samo ime storitve, brez "0,00 €").
export function formatPrice(price: number): string {
  return price.toLocaleString("sl-SI", { style: "currency", currency: "EUR" });
}

// "30" -> "30 min", "60" -> "1 h", "90" -> "1 h 30 min". Klicatelj naj
// pokliče SAMO, če je trajanje nastavljeno (glej formatPrice zgoraj za isti
// null-pomeni-"še ni nastavljeno" vzorec).
export function formatDuration(durationMinutes: number): string {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

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
export function upcomingBusinessWeeks(weekCount = BOOKING_WINDOW_WEEKS): BusinessWeek[] {
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

// ---------------------------------------------------------------------------
// Validacija vnosa na javnem rezervacijskem obrazcu (/[slug]) - uporabljeno
// TAKO na klientu (takojšen toast) KOT na strežniku (actions.ts, ker je
// Server Action dosegljiv z neposrednim POST-om mimo UI-ja, glej
// node_modules/next/dist/docs/.../data-security.md - "Validating client
// input"). Namenoma ohlapno (ne zahtevamo črkovnega nabora, ločil ipd.) - cilj
// je zavrniti OČITNO nesmiselne vnose ("A", "12"), ne biti frustrirajoč za
// prave stranke (šumniki, vezaji, dvojni priimki ...).
// ---------------------------------------------------------------------------
export const MIN_NAME_LENGTH = 3;
export const MIN_PHONE_DIGITS = 8;
export const MAX_PHONE_DIGITS = 15;

// Vsaj 3 znaki IN vsaj en presledek (namiguje na "ime priimek", ne eno samo
// besedo) - brez zahtev po abecedi, da ne zavrne veljavnih imen s šumniki,
// vezaji ipd.
export function isValidCustomerName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < MIN_NAME_LENGTH) return false;
  return /\S\s+\S/.test(trimmed);
}

// Dovoli presledke/vezaje/oklepaje in neobvezen vodilni "+" (npr. "+386 40
// 123 456", "040-123-456", "(040) 123 456"), nato preveri samo ŠTEVILO
// številk - dovolj za slovensko lokalno (9: "0" + 8) ali mednarodno (11:
// "386" + 8) obliko, brez vezave na en sam natančen format.
export function isValidPhone(phone: string): boolean {
  const trimmed = phone.trim();
  if (!/^\+?[\d\s()-]+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= MIN_PHONE_DIGITS && digits.length <= MAX_PHONE_DIGITS;
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

// ---------------------------------------------------------------------------
// "Dodaj v koledar" gumbi na potrditveni strani po uspešni rezervaciji (glej
// booking-page.tsx) - brez zunanjega API-ja/stroška, oboje se generira samo
// iz podatkov, ki jih rezervacija že ima (storitev/datum/ura/trajanje/naslov
// salona). Datum+ura sta VEDNO v lokalnem času stranke, ki rezervira (isti
// čas kot salon - gre za fizičen obisk) - spodaj ju pretvorimo v UTC "Z"
// obliko, ki jo tako Google Calendar kot .ics razumeta ne glede na to, v
// katerem času je odprt sam koledar.
// ---------------------------------------------------------------------------
export type CalendarEvent = {
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  durationMinutes: number;
  location: string | null;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// "20260922T090000Z" - iz LOKALNIH komponent (isti vzorec kot toISODate
// zgoraj), nato prebrano nazaj prek getUTC* - Date interno vedno hrani UTC
// trenutek, zato to pravilno upošteva stranjkin lokalni odmik od UTC.
function toUtcStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

// Lokalni Date iz ločenih "YYYY-MM-DD" + "HH:MM" polj (isti vzorec kot
// toISODate/todayISO zgoraj - NIKOLI prek enotnega ISO stringa z "Z", da se
// izognemo UTC-premiku). Skupna gradnja za eventRange spodaj IN
// isPastCancellationDeadline (glej ta pogovor s Claude o /rezervacija/[token]).
export function appointmentDateTime(date: string, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const d = new Date(date + "T00:00:00");
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function eventRange(event: CalendarEvent): { start: Date; end: Date } {
  const start = appointmentDateTime(event.date, event.time);
  const end = new Date(start.getTime() + event.durationMinutes * 60_000);
  return { start, end };
}

export function buildGoogleCalendarUrl(event: CalendarEvent): string {
  const { start, end } = eventRange(event);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${toUtcStamp(start)}/${toUtcStamp(end)}`,
  });
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Uide vejico/podpičje/nazaj-poševnico/novo vrstico, kot zahteva iCalendar
// (RFC 5545, 3.3.11) - brez tega bi npr. vejica v naslovu salona pretrgala
// polje na napačnem mestu.
function escapeIcsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/[,;]/g, "\\$&").replace(/\n/g, "\\n");
}

export function buildIcsContent(event: CalendarEvent): string {
  const { start, end } = eventRange(event);
  const now = toUtcStamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Fillio//Rezervacija//SL",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${now}-${Math.random().toString(36).slice(2)}@fillio.si`,
    `DTSTAMP:${now}`,
    `DTSTART:${toUtcStamp(start)}`,
    `DTEND:${toUtcStamp(end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

// Sproži prenos .ics datoteke - klicatelj (booking-page.tsx) to pokliče iz
// onClick-a gumba "Dodaj v Apple koledar" (Apple/macOS/iOS nima svojega
// spletnega "add event" URL-ja kot Google, samo odpre ponujeno .ics
// datoteko).
export function downloadIcsFile(event: CalendarEvent) {
  const blob = new Blob([buildIcsContent(event)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${event.title.replace(/[^\p{L}\p{N}]+/gu, "-")}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Rok za odpoved/prenaročanje termina (glej /rezervacija/[token] in pogovor s
// Claude) - trenutno FIKSEN in ENAK za vse salone, namenoma trdo kodiran (ni
// UI nastavitve po salonu - glej ZNANE_OMEJITVE.md "Rok za odpoved/
// prenaročanje"). Velja TAKO za stranko (rezervacija/[token]/actions.ts) KOT
// za lastnikovo cancelAppointment (owner/actions.ts) - isti prag za oba.
// ---------------------------------------------------------------------------
export const CANCELLATION_NOTICE_HOURS = 3;

// true, če je do začetka termina manj kot CANCELLATION_NOTICE_HOURS ur (ali
// je termin že minil) - odpoved/prenaročanje takrat ni več mogoče.
export function isPastCancellationDeadline(date: string, time: string): boolean {
  const apptTime = appointmentDateTime(date, time).getTime();
  const deadline = apptTime - CANCELLATION_NOTICE_HOURS * 60 * 60 * 1000;
  return Date.now() >= deadline;
}

// Javna povezava, s katero stranka upravlja svoj termin (glej
// src/app/rezervacija/[token]/) - uporabljena v WhatsApp sporočilih
// (manual-booking-form.tsx, owner/page.tsx "Pošlji opomnik"), potrditveni
// e-pošti (src/lib/email.ts) IN na sami potrditveni strani (booking-page.tsx,
// gumb "Kopiraj povezavo").
export function bookingManageUrl(token: string): string {
  return `${PLATFORM_URL}/rezervacija/${token}`;
}

// Namenoma ohlapno (samo "nekaj@nekaj.nekaj") - dovolj za zavrnitev OČITNO
// nepopolnega vnosa na opt-in polju za potrditveno e-pošto (glej
// booking-page.tsx), ne polna RFC 5322 validacija (Resend bo tako ali tako
// zavrnil dejansko neobstoječ naslov ob pošiljanju).
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
