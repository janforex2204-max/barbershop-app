import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { weekDates, weekLabel, shiftWeek } from "@/lib/constants";
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
import type { SalonDayHours } from "@/types/database.types";
import CalendarBlock from "./calendar-block";
import DayEmployeeColumns from "./day-employee-columns";

const WEEKDAY_LABELS = ["Pon", "Tor", "Sre", "Čet", "Pet", "Sob", "Ned"];

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
  employees: WeekCalendarEmployee[];
  salonHours: SalonDayHours[] | null;
}) {
  const dates = weekDates(weekStart);
  const hoursSources = employees.length > 0 ? employees.map((e) => e.hours) : [salonHours ?? []];
  const { startMinutes, endMinutes } = computeWeekHourRange(dates, hoursSources, appointments);
  const totalMinutes = endMinutes - startMinutes;
  const gridHeight = totalMinutes * PX_PER_MINUTE;

  const appointmentsByDate = new Map<string, WeekAppointment[]>();
  for (const date of dates) appointmentsByDate.set(date, []);
  for (const appt of appointments) appointmentsByDate.get(appt.date)?.push(appt);

  const hourMarks: number[] = [];
  for (let m = Math.ceil(startMinutes / 60) * 60; m <= endMinutes; m += 60) hourMarks.push(m);

  // Pri 2+ (aktivnih) zaposlenih na dovolj širokem zaslonu (lg:, glej
  // day-employee-columns.tsx) se dnevi-kot-stolpci spodaj nadomestijo s
  // ENIM dnem + zaposlenimi-kot-stolpci (vzorec kot Fresha, glej pogovor s
  // Claude, item 3) - OBE postavitvi se izrišeta, CSS (lg:hidden/hidden
  // lg:block) izbere pravo, brez JS zaznavanja širine zaslona (isti vzorec
  // kot že owner/page.tsx glave gumbi in day-hours-editor.tsx mreža). Pri
  // 0/1 zaposlenem ni česa razdeliti po zaposlenem - en implicit stolpec na
  // OBEH širinah, torej ostane spodnja (dnevi-kot-stolpci) postavitev.
  const showEmployeeColumns = employees.length >= 2;

  return (
    <div className="week-calendar-container border border-border rounded-lg p-4 mb-8 bg-calendar-panel">
      {showEmployeeColumns && (
        <div className="hidden lg:block">
          <DayEmployeeColumns
            weekStart={weekStart}
            selectedDate={selectedDate}
            appointments={appointments}
            employees={employees}
          />
        </div>
      )}

      <div className={showEmployeeColumns ? "lg:hidden" : ""}>
        <div className="flex items-center justify-between mb-3">
          <Link
            href={`/owner?date=${selectedDate}&view=week&week=${shiftWeek(weekStart, -1)}`}
            scroll={false}
            className="p-1.5 rounded hover:bg-ink-soft text-cream-dim hover:text-cream"
          >
            <ChevronLeft size={16} />
          </Link>
          <span className="font-display text-base text-cream capitalize">{weekLabel(weekStart)}</span>
          <Link
            href={`/owner?date=${selectedDate}&view=week&week=${shiftWeek(weekStart, 1)}`}
            scroll={false}
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
                scroll={false}
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
        {/* overscroll-y-contain - brez tega scroll ob doseženi zgornji/spodnji
            meji te notranje mreže "uide" na CELO stran (privzeto browser
            scroll-chaining vedenje, glej pogovor s Claude - opazno predvsem
            pri trackpadu). */}
        <div
          className="overflow-y-auto overscroll-y-contain border-t border-border-soft"
          style={{ maxHeight: 600 }}
        >
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
                  {laidOut.map((appt) => (
                    <CalendarBlock
                      key={appt.id}
                      appt={appt}
                      href={`/owner?date=${date}&view=week&week=${weekStart}`}
                      top={(appt.startMinutes - startMinutes) * PX_PER_MINUTE}
                      height={Math.max(appt.durationMinutes * PX_PER_MINUTE, MIN_BLOCK_HEIGHT)}
                      leftPct={appt.lane * (100 / appt.laneCount)}
                      widthPct={100 / appt.laneCount}
                      color={resolveEmployeeColor(appt.employeeId, employees)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {employees.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3 pt-3 border-t border-border-soft">
            {employees.map((e) => (
              <span key={e.id} className="flex items-center gap-1.5 text-xs text-cream-dim">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: resolveEmployeeColor(e.id, employees) }}
                />
                {e.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
