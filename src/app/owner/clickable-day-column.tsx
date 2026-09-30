"use client";

import { type ReactNode, type MouseEvent } from "react";
import { SLOT_GRANULARITY_MINUTES } from "@/lib/availability";
import { PX_PER_MINUTE } from "@/lib/week-layout";
import { useCalendarBooking } from "./calendar-booking-context";

// Ovojnik ENEGA dneva/zaposlenega stolpca (week-calendar.tsx dnevi-kot-
// stolpci, day-employee-columns.tsx zaposleni-kot-stolpci) - klik na PROSTO
// uro odpre obrazec za ročni vnos, predizpolnjen z datumom/uro (in
// zaposlenim, če je znan iz konteksta stolpca) - glej pogovor s Claude.
// Klik na OBSTOJEČ termin (CalendarBlock je <Link>/<button>, otrok tega
// ovojnika) NE sme sprožiti tega - target.closest("a"/"button") to izloči,
// preden pride do izračuna ure.
export default function ClickableDayColumn({
  date,
  employeeId,
  startMinutes,
  endMinutes,
  children,
}: {
  date: string;
  employeeId: string | null;
  startMinutes: number;
  endMinutes: number;
  children: ReactNode;
}) {
  const { openSlot } = useCalendarBooking();

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("a") || target.closest("button")) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    let minutes = startMinutes + offsetY / PX_PER_MINUTE;
    // Zaokroži na najbližjo četrt ure - isti SLOT_GRANULARITY_MINUTES vzorec
    // kot computeFreeSlots (src/lib/availability.ts), da predizpolnjen čas
    // VEDNO pade na kandidatni čas, ki ga freeTimes mreža spodaj lahko ponudi.
    minutes = Math.round(minutes / SLOT_GRANULARITY_MINUTES) * SLOT_GRANULARITY_MINUTES;
    minutes = Math.max(startMinutes, Math.min(minutes, endMinutes - SLOT_GRANULARITY_MINUTES));

    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    openSlot({ date, time: `${hh}:${mm}`, employeeId });
  }

  return (
    <div
      className="relative border-l border-border-soft cursor-pointer"
      onClick={handleClick}
    >
      {children}
    </div>
  );
}
