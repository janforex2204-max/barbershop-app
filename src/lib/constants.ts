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

export function timeBucket(hhmm: string): "dopoldan" | "popoldan" {
  const h = parseInt(hhmm.split(":")[0], 10);
  return h < 13 ? "dopoldan" : "popoldan";
}
