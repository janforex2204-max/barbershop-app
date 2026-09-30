import Link from "next/link";
import { ChevronLeft, ChevronRight, User } from "lucide-react";
import { addDays, weekStartOf, dayLabel } from "@/lib/constants";
import {
  layoutDayAppointments,
  computeWeekHourRange,
  resolveEmployeeColor,
  PX_PER_MINUTE,
  MIN_BLOCK_HEIGHT,
  TIME_GUTTER_PX,
  formatHourLabel,
  type WeekAppointment,
  type WeekCalendarEmployee,
} from "@/lib/week-layout";
import CalendarBlock from "./calendar-block";

// Dnevni pogled, stolpci = zaposleni (vzorec kot Fresha, glej pogovor s
// Claude, item 3) - prikazano SAMO na lg:+ zaslonih pri 2+ aktivnih
// zaposlenih (glej hidden lg:block ovojnik v week-calendar.tsx, ki to
// izriše). Navigacija je zdaj po DNEVIH, ne tednih - klik na < / >
// premakne selectedDate (in posledično week=, če dan pade v drug teden) za
// en dan, ne cel teden.
export default function DayEmployeeColumns({
  weekStart,
  selectedDate,
  appointments,
  employees,
}: {
  weekStart: string;
  selectedDate: string;
  appointments: WeekAppointment[];
  employees: WeekCalendarEmployee[];
}) {
  const dayAppointments = appointments.filter((a) => a.date === selectedDate);
  const activeIds = new Set(employees.map((e) => e.id));

  // Termini brez dodeljenega zaposlenega ALI dodeljeni nekomu, ki ni več
  // med aktivnimi (deaktiviran po rezervaciji, glej pogovor s Claude) -
  // eden skupen "Ni dodeljeno" stolpec, samo če dejansko obstaja kaj zanj
  // TA dan (ne prikaže se prazen).
  const hasUnassigned = dayAppointments.some((a) => !a.employeeId || !activeIds.has(a.employeeId));

  type Column = { id: string | null; name: string; photoUrl: string | null; color: string };
  const columns: Column[] = employees.map((e) => ({
    id: e.id,
    name: e.name,
    photoUrl: e.photo_url,
    color: resolveEmployeeColor(e.id, employees),
  }));
  if (hasUnassigned) {
    columns.push({ id: null, name: "Ni dodeljeno", photoUrl: null, color: "var(--color-cal-none)" });
  }

  const hoursSources = employees.map((e) => e.hours);
  const { startMinutes, endMinutes } = computeWeekHourRange([selectedDate], hoursSources, dayAppointments);
  const totalMinutes = endMinutes - startMinutes;
  const gridHeight = totalMinutes * PX_PER_MINUTE;

  const hourMarks: number[] = [];
  for (let m = Math.ceil(startMinutes / 60) * 60; m <= endMinutes; m += 60) hourMarks.push(m);

  const prevDate = addDays(selectedDate, -1);
  const nextDate = addDays(selectedDate, 1);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <Link
          href={`/owner?date=${prevDate}&view=week&week=${weekStartOf(prevDate)}`}
          scroll={false}
          className="p-1.5 rounded hover:bg-ink-soft text-cream-dim hover:text-cream"
        >
          <ChevronLeft size={16} />
        </Link>
        <span className="font-display text-base text-cream capitalize">{dayLabel(selectedDate)}</span>
        <Link
          href={`/owner?date=${nextDate}&view=week&week=${weekStartOf(nextDate)}`}
          scroll={false}
          className="p-1.5 rounded hover:bg-ink-soft text-cream-dim hover:text-cream"
        >
          <ChevronRight size={16} />
        </Link>
      </div>

      {/* Glave stolpcev - fotografija (obstoječi photo_url, isti krožni
          vzorec kot [slug]/booking-page.tsx izbira izvajalca, placeholder
          ikona osebe brez naložene slike) + ime. */}
      <div
        className="grid gap-px mb-1"
        style={{ gridTemplateColumns: `${TIME_GUTTER_PX}px repeat(${columns.length}, 1fr)` }}
      >
        <div />
        {columns.map((col) => (
          <div key={col.id ?? "unassigned"} className="flex flex-col items-center gap-1 py-1.5 px-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-ink-field border border-border overflow-hidden flex items-center justify-center shrink-0">
              {col.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- zunanja, dinamična Storage URL (ni lokalna slika)
                <img src={col.photoUrl} alt={col.name} className="w-full h-full object-cover" />
              ) : (
                <User size={14} className="text-cream-faint" />
              )}
            </div>
            <span className="text-[11px] text-cream-dim truncate max-w-full">{col.name}</span>
          </div>
        ))}
      </div>

      {/* overscroll-y-contain - glej isto opombo v week-calendar.tsx. */}
      <div
        className="overflow-y-auto overscroll-y-contain border-t border-border-soft"
        style={{ maxHeight: 600 }}
      >
        <div
          className="grid gap-px relative"
          style={{ gridTemplateColumns: `${TIME_GUTTER_PX}px repeat(${columns.length}, 1fr)`, height: gridHeight }}
        >
          <div className="relative">
            {hourMarks.map((m) => (
              <span
                key={m}
                className="absolute right-1.5 -translate-y-1/2 text-[10px] text-cream-faint"
                style={{ top: (m - startMinutes) * PX_PER_MINUTE }}
              >
                {formatHourLabel(m)}
              </span>
            ))}
          </div>

          {columns.map((col) => {
            const colAppointments = dayAppointments.filter((a) =>
              col.id === null ? !a.employeeId || !activeIds.has(a.employeeId) : a.employeeId === col.id
            );
            // layoutDayAppointments (lane-razdelitev za prekrivanje) je tu
            // večinoma no-op - EN zaposleni ne more imeti dveh sočasnih
            // terminov (unique index, glej supabase/schema.sql) - a se
            // vseeno uporabi dosledno (isti, že preverjen algoritem), ker
            // "Ni dodeljeno" stolpec TO prekrivanje dejansko lahko ima.
            const laidOut = layoutDayAppointments(colAppointments);
            return (
              <div key={col.id ?? "unassigned"} className="relative border-l border-border-soft">
                {hourMarks.map((m) => (
                  <div
                    key={m}
                    className="absolute w-full border-t border-border-soft/50"
                    style={{ top: (m - startMinutes) * PX_PER_MINUTE }}
                  />
                ))}
                {laidOut.map((appt) => (
                  <CalendarBlock
                    key={appt.id}
                    appt={appt}
                    href={`/owner?date=${selectedDate}&view=week&week=${weekStart}`}
                    top={(appt.startMinutes - startMinutes) * PX_PER_MINUTE}
                    height={Math.max(appt.durationMinutes * PX_PER_MINUTE, MIN_BLOCK_HEIGHT)}
                    leftPct={appt.lane * (100 / appt.laneCount)}
                    widthPct={100 / appt.laneCount}
                    color={col.color}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
