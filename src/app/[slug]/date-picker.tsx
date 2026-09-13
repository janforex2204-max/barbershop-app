"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { dayLabel, upcomingBusinessWeeks } from "@/lib/constants";

function shortLabel(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const weekday = d.toLocaleDateString("sl-SI", { weekday: "short" });
  return { weekday, day: d.getDate(), month: d.getMonth() + 1 };
}

export default function DatePicker({
  selectedDate,
  onSelect,
}: {
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const weeks = upcomingBusinessWeeks();

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative mb-7">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between py-3 px-4 rounded-md border border-border bg-ink-field text-cream text-sm capitalize cursor-pointer"
      >
        {dayLabel(selectedDate)}
        <ChevronDown
          size={16}
          className={`text-cream-faint transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute z-10 mt-2 w-full rounded-md border border-border bg-ink-elevated shadow-lg p-3 max-h-96 overflow-y-auto">
          {weeks.map((week) => (
            <div key={week.label} className="mb-3 last:mb-0">
              <p className="text-xs text-cream-faint uppercase tracking-wide mb-1.5">
                {week.label}
              </p>
              <div className="grid grid-cols-5 gap-1.5">
                {week.dates.map((d) => {
                  const { weekday, day, month } = shortLabel(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        onSelect(d);
                        setOpen(false);
                      }}
                      className={`py-2 rounded-md border cursor-pointer transition-colors capitalize ${
                        selectedDate === d
                          ? "border-gold bg-[#3A2A1A] text-cream"
                          : "border-border text-cream bg-transparent hover:border-cream-faint"
                      }`}
                    >
                      <div className="text-[11px] leading-tight">{weekday}</div>
                      <div className="text-xs leading-tight">
                        {day}.{month}.
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
