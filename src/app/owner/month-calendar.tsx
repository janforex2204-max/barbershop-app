import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { isBusinessDay, monthGrid, monthLabel, shiftMonth } from "@/lib/constants";

const WEEKDAY_LABELS = ["Pon", "Tor", "Sre", "Čet", "Pet", "Sob", "Ned"];

export default function MonthCalendar({
  monthStr,
  selectedDate,
  today,
  countsByDate,
  waitingDates,
}: {
  monthStr: string;
  selectedDate: string;
  today: string;
  countsByDate: Record<string, number>;
  waitingDates: Set<string>;
}) {
  const weeks = monthGrid(monthStr);

  return (
    <div className="border border-border rounded-lg p-4 mb-8">
      <div className="flex items-center justify-between mb-3">
        <Link
          href={`/owner?date=${selectedDate}&month=${shiftMonth(monthStr, -1)}`}
          className="p-1.5 rounded hover:bg-ink-soft text-cream-dim hover:text-cream"
        >
          <ChevronLeft size={16} />
        </Link>
        <span className="font-display text-base text-cream capitalize">
          {monthLabel(monthStr)}
        </span>
        <Link
          href={`/owner?date=${selectedDate}&month=${shiftMonth(monthStr, 1)}`}
          className="p-1.5 rounded hover:bg-ink-soft text-cream-dim hover:text-cream"
        >
          <ChevronRight size={16} />
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="text-center text-[10px] text-cream-faint uppercase">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weeks.flatMap((week, wi) =>
          week.map((iso, di) => (
            <DayCell
              key={iso ?? `blank-${wi}-${di}`}
              iso={iso}
              monthStr={monthStr}
              selectedDate={selectedDate}
              today={today}
              count={iso ? countsByDate[iso] ?? 0 : 0}
              waiting={iso ? waitingDates.has(iso) : false}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DayCell({
  iso,
  monthStr,
  selectedDate,
  today,
  count,
  waiting,
}: {
  iso: string | null;
  monthStr: string;
  selectedDate: string;
  today: string;
  count: number;
  waiting: boolean;
}) {
  if (!iso) return <div />;

  const dayNum = Number(iso.slice(8, 10));
  const closed = !isBusinessDay(iso);

  if (closed) {
    return (
      <div className="aspect-square flex items-center justify-center rounded-md text-cream-ghost opacity-40 text-xs">
        {dayNum}
      </div>
    );
  }

  const isSelected = iso === selectedDate;
  const isToday = iso === today;

  return (
    <Link
      href={`/owner?date=${iso}&month=${monthStr}`}
      className={`aspect-square flex flex-col items-center justify-center gap-0.5 rounded-md border text-xs transition-colors ${
        isSelected
          ? "border-gold bg-selected text-cream"
          : isToday
            ? "border-cream-faint text-cream hover:border-gold"
            : "border-transparent text-cream hover:border-border"
      }`}
    >
      <span>{dayNum}</span>
      <span className="flex items-center gap-1 h-3">
        {count > 0 && (
          <span className="text-[9px] px-1 rounded-full bg-gold/80 text-ink leading-none">
            {count}
          </span>
        )}
        {waiting && <span className="w-1.5 h-1.5 rounded-full bg-sage" />}
      </span>
    </Link>
  );
}
