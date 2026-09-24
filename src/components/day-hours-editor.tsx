"use client";

import type { SalonDayHours } from "@/types/database.types";

// DAYS/defaultHours so zdaj definirani v src/lib/default-hours.ts (brez
// "use client", da jih lahko kliče tudi server koda) - tu samo re-export
// za nazaj združljivost obstoječih uvozov iz te poti.
export { DAYS, defaultHours } from "@/lib/default-hours";

// Dve vizualni različici, isto vedenje/stanje (glej DayHoursEditor spodaj) -
// "marketing" ohranja obstoječi temni "fillio" videz registracijskega
// wizarda (glej pogovor s Claude - ta stran ima svojo, od preostale app
// ločeno znamčenje, font-marketing itd.), "app" se sklada z ink/cream žetoni,
// uporabljenimi povsod drugod na /owner (glej npr. owner/services/page.tsx).
type Variant = "marketing" | "app";

const STYLES: Record<
  Variant,
  {
    container: string;
    dayLabel: string;
    toggleOpen: string;
    toggleClosed: string;
    timeInput: string;
    dash: string;
    breakLabel: string;
    breakTimeInput: string;
  }
> = {
  marketing: {
    container: "flex flex-col gap-2.5 rounded-md border border-white/[0.08] bg-[#17181B] p-4",
    dayLabel: "text-sm font-semibold text-white/80",
    toggleOpen:
      "cursor-pointer rounded-[3px] px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide bg-fillio-tealLight text-fillio-dark",
    toggleClosed:
      "cursor-pointer rounded-[3px] px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide bg-white/10 text-white/50",
    timeInput:
      "w-full rounded-[3px] border border-white/15 bg-fillio-dark px-2.5 py-1.5 text-sm text-white disabled:opacity-30",
    dash: "text-center text-xs text-white/40",
    breakLabel: "flex items-center gap-1.5 text-xs text-white/50 cursor-pointer",
    breakTimeInput:
      "rounded-[3px] border border-white/15 bg-fillio-dark px-2 py-1 text-xs text-white",
  },
  app: {
    container: "flex flex-col gap-2.5 rounded-md border border-border bg-ink-field p-4",
    dayLabel: "text-sm font-semibold text-cream",
    toggleOpen:
      "cursor-pointer rounded-md px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide bg-gold text-ink",
    toggleClosed:
      "cursor-pointer rounded-md px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide bg-ink-soft text-cream-faint",
    timeInput:
      "w-full rounded-md border border-border bg-ink px-2.5 py-1.5 text-sm text-cream disabled:opacity-30",
    dash: "text-center text-xs text-cream-faint",
    breakLabel: "flex items-center gap-1.5 text-xs text-cream-faint cursor-pointer",
    breakTimeInput: "rounded-md border border-border bg-ink px-2 py-1 text-xs text-cream",
  },
};

// Urejevalnik urnika po dnevih - deljen med registracijskim wizardom
// (owner/register/page.tsx, variant="marketing") in /owner/hours
// (variant="app", edino mesto, kjer lastnik urnik lahko uredi PO
// registraciji - ta stran prej sploh ni obstajala). Nadzorovana komponenta
// (hours/onChange), da klicatelj sam odloči, kdaj/kam shrani (wizard šele
// ob oddaji celotnega obrazca, /owner/hours prek lastnega Shrani gumba).
export default function DayHoursEditor({
  hours,
  onChange,
  variant = "app",
}: {
  hours: SalonDayHours[];
  onChange: (hours: SalonDayHours[]) => void;
  variant?: Variant;
}) {
  const s = STYLES[variant];

  function toggleDayClosed(index: number) {
    onChange(hours.map((d, i) => (i === index ? { ...d, closed: !d.closed } : d)));
  }

  function updateDayTime(index: number, field: "from" | "to", value: string) {
    onChange(hours.map((d, i) => (i === index ? { ...d, [field]: value } : d)));
  }

  // Premor je NEOBVEZEN - checkbox ga doda/odstrani v celoti (breakFrom IN
  // breakTo skupaj), ne samo prazni čas, da shranjen urnik nikoli nima
  // "polovičnega" premora (glej resolveDayBreak v src/lib/availability.ts,
  // ki zahteva OBA polja).
  function toggleBreak(index: number) {
    onChange(
      hours.map((d, i) => {
        if (i !== index) return d;
        if (d.breakFrom || d.breakTo) {
          const rest: SalonDayHours = { day: d.day, closed: d.closed, from: d.from, to: d.to };
          return rest;
        }
        return { ...d, breakFrom: "12:00", breakTo: "13:00" };
      })
    );
  }

  function updateBreakTime(index: number, field: "breakFrom" | "breakTo", value: string) {
    onChange(hours.map((d, i) => (i === index ? { ...d, [field]: value } : d)));
  }

  return (
    <div className={s.container}>
      {hours.map((d, i) => {
        const hasBreak = d.breakFrom !== undefined && d.breakTo !== undefined;
        return (
          <div key={d.day} className="flex flex-col gap-1.5">
            <div className="grid grid-cols-[120px_90px_1fr_auto_1fr] items-center gap-3">
              <span className={s.dayLabel}>{d.day}</span>
              <button
                type="button"
                onClick={() => toggleDayClosed(i)}
                className={d.closed ? s.toggleClosed : s.toggleOpen}
              >
                {d.closed ? "Zaprto" : "Odprto"}
              </button>
              <input
                type="time"
                value={d.from}
                disabled={d.closed}
                onChange={(e) => updateDayTime(i, "from", e.target.value)}
                className={s.timeInput}
              />
              <span className={s.dash}>–</span>
              <input
                type="time"
                value={d.to}
                disabled={d.closed}
                onChange={(e) => updateDayTime(i, "to", e.target.value)}
                className={s.timeInput}
              />
            </div>
            {/* Premor - SAMO za odprte dni (glej pogovor s Claude), poravnan
                pod stolpec za odpri/zapri gumb (pl-[120px] preskoči
                dnevni-label stolpec zgoraj). */}
            {!d.closed && (
              <div className="flex items-center gap-2 pl-[120px]">
                <label className={s.breakLabel}>
                  <input
                    type="checkbox"
                    checked={hasBreak}
                    onChange={() => toggleBreak(i)}
                    className="cursor-pointer"
                  />
                  Premor (npr. malica)
                </label>
                {hasBreak && (
                  <>
                    <input
                      type="time"
                      value={d.breakFrom}
                      onChange={(e) => updateBreakTime(i, "breakFrom", e.target.value)}
                      className={s.breakTimeInput}
                    />
                    <span className={s.dash}>–</span>
                    <input
                      type="time"
                      value={d.breakTo}
                      onChange={(e) => updateBreakTime(i, "breakTo", e.target.value)}
                      className={s.breakTimeInput}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
