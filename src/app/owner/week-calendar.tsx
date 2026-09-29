import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { weekDates, weekLabel, shiftWeek } from "@/lib/constants";
import {
  layoutDayAppointments,
  computeWeekHourRange,
  type WeekAppointment,
} from "@/lib/week-layout";
import type { SalonDayHours } from "@/types/database.types";

const WEEKDAY_LABELS = ["Pon", "Tor", "Sre", "Čet", "Pet", "Sob", "Ned"];
// Cikel po sort_order - glej --color-cal-* v globals.css (konstantne, ne
// obrnejo se s temo, glej opombo tam). "none" (employee_id null) NI del
// cikla - vedno --color-cal-none.
const EMPLOYEE_COLORS = ["var(--color-cal-1)", "var(--color-cal-2)", "var(--color-cal-3)", "var(--color-cal-4)"];

// Slikovnih ~64px/uro - dovolj gosto, da teden (tipično 8-12 ur odprtja) ne
// zahteva pretiranega navpičnega scrolla, a še vedno pusti prostor za
// ime+storitev v bloku. minHeight na bloku (glej spodaj) ščiti zelo kratke
// termine pred nečitljivo majhno višino.
const PX_PER_MINUTE = 1.05;
const MIN_BLOCK_HEIGHT = 34;
const TIME_GUTTER_PX = 44;

function employeeColor(employeeId: string | null, colorByEmployee: Map<string, string>): string {
  if (!employeeId) return "var(--color-cal-none)";
  return colorByEmployee.get(employeeId) ?? "var(--color-cal-none)";
}

function formatHourLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  return `${String(h).padStart(2, "0")}:00`;
}

export default function WeekCalendar({
  weekStart,
  selectedDate,
  today,
  appointments,
  employees,
  salonHours,
}: {
  weekStart: string;
  selectedDate: string;
  today: string;
  appointments: WeekAppointment[];
  employees: { id: string; name: string; hours: SalonDayHours[] }[];
  salonHours: SalonDayHours[] | null;
}) {
  const dates = weekDates(weekStart);
  const hoursSources = employees.length > 0 ? employees.map((e) => e.hours) : [salonHours ?? []];
  const { startMinutes, endMinutes } = computeWeekHourRange(dates, hoursSources, appointments);
  const totalMinutes = endMinutes - startMinutes;
  const gridHeight = totalMinutes * PX_PER_MINUTE;

  const colorByEmployee = new Map(employees.map((e, i) => [e.id, EMPLOYEE_COLORS[i % EMPLOYEE_COLORS.length]]));

  const appointmentsByDate = new Map<string, WeekAppointment[]>();
  for (const date of dates) appointmentsByDate.set(date, []);
  for (const appt of appointments) appointmentsByDate.get(appt.date)?.push(appt);

  const hourMarks: number[] = [];
  for (let m = Math.ceil(startMinutes / 60) * 60; m <= endMinutes; m += 60) hourMarks.push(m);

  return (
    <div className="week-calendar-container border border-border rounded-lg p-4 mb-8 bg-calendar-panel">
      <div className="flex items-center justify-between mb-3">
        <Link
          href={`/owner?date=${selectedDate}&view=week&week=${shiftWeek(weekStart, -1)}`}
          className="p-1.5 rounded hover:bg-ink-soft text-cream-dim hover:text-cream"
        >
          <ChevronLeft size={16} />
        </Link>
        <span className="font-display text-base text-cream capitalize">{weekLabel(weekStart)}</span>
        <Link
          href={`/owner?date=${selectedDate}&view=week&week=${shiftWeek(weekStart, 1)}`}
          className="p-1.5 rounded hover:bg-ink-soft text-cream-dim hover:text-cream"
        >
          <ChevronRight size={16} />
        </Link>
      </div>

      {/* Dnevi tedna - naslovna vrstica, poravnana z uro-gutterjem spodaj
          (isti TIME_GUTTER_PX odmik). */}
      <div className="grid gap-px mb-1" style={{ gridTemplateColumns: `${TIME_GUTTER_PX}px repeat(7, 1fr)` }}>
        <div />
        {dates.map((date, i) => {
          const isSelected = date === selectedDate;
          const isToday = date === today;
          return (
            <Link
              key={date}
              href={`/owner?date=${date}&view=week&week=${weekStart}`}
              className={`flex flex-col items-center py-1 rounded-md border text-xs ${
                isSelected
                  ? "border-gold bg-selected text-cream"
                  : isToday
                    ? "border-cream-faint text-cream hover:border-gold"
                    : "border-transparent text-cream-dim hover:border-border hover:text-cream"
              }`}
            >
              <span className="uppercase text-[10px] text-cream-faint">{WEEKDAY_LABELS[i]}</span>
              <span className="font-semibold">{Number(date.slice(8, 10))}</span>
            </Link>
          );
        })}
      </div>

      {/* Drsna urna mreža - relative/absolute pozicioniranje (ne CSS grid
          vrstice), da lahko termin sega na poljubno minuto/trajanje, ne le na
          fiksne urne vrstice. */}
      <div className="overflow-y-auto border-t border-border-soft" style={{ maxHeight: 600 }}>
        <div
          className="grid gap-px relative"
          style={{ gridTemplateColumns: `${TIME_GUTTER_PX}px repeat(7, 1fr)`, height: gridHeight }}
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

          {dates.map((date) => {
            const laidOut = layoutDayAppointments(appointmentsByDate.get(date) ?? []);
            return (
              <div key={date} className="relative border-l border-border-soft">
                {hourMarks.map((m) => (
                  <div
                    key={m}
                    className="absolute w-full border-t border-border-soft/50"
                    style={{ top: (m - startMinutes) * PX_PER_MINUTE }}
                  />
                ))}
                {laidOut.map((appt) => {
                  const top = (appt.startMinutes - startMinutes) * PX_PER_MINUTE;
                  const height = Math.max(appt.durationMinutes * PX_PER_MINUTE, MIN_BLOCK_HEIGHT);
                  const widthPct = 100 / appt.laneCount;
                  const leftPct = appt.lane * widthPct;
                  return (
                    <Link
                      key={appt.id}
                      href={`/owner?date=${date}&view=week&week=${weekStart}`}
                      title={`${appt.time} - ${appt.customerName} (${appt.service})`}
                      className="absolute rounded px-1 py-0.5 overflow-hidden text-[10px] leading-tight text-white hover:brightness-110 transition-[filter]"
                      style={{
                        top,
                        height,
                        left: `calc(${leftPct}% + 1px)`,
                        width: `calc(${widthPct}% - 2px)`,
                        background: employeeColor(appt.employeeId, colorByEmployee),
                      }}
                    >
                      <div className="font-semibold truncate">{appt.customerName}</div>
                      <div className="truncate opacity-80">{appt.service}</div>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {employees.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3 pt-3 border-t border-border-soft">
          {employees.map((e, i) => (
            <span key={e.id} className="flex items-center gap-1.5 text-xs text-cream-dim">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: EMPLOYEE_COLORS[i % EMPLOYEE_COLORS.length] }}
              />
              {e.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
