export const SHOP_NAME = "Barbershop pr' Kljuni";

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

export function todayISO(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
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

export function timeBucket(hhmm: string): "dopoldan" | "popoldan" {
  const h = parseInt(hhmm.split(":")[0], 10);
  return h < 13 ? "dopoldan" : "popoldan";
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
