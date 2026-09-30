"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import ManualBookingForm from "./manual-booking-form";
import type { SalonDayHours } from "@/types/database.types";

type SlotPrefill = { date: string; time: string; employeeId: string | null };

const CalendarBookingContext = createContext<{
  openSlot: (prefill: SlotPrefill) => void;
} | null>(null);

// Kliče se iz ClickableDayColumn (globoko v WeekCalendar/DayEmployeeColumns,
// oba SERVER komponenti - funkcije se prek RSC meje ne morejo prenesti kot
// props, zato Context namesto prop-drillinga, glej pogovor s Claude).
export function useCalendarBooking() {
  const ctx = useContext(CalendarBookingContext);
  if (!ctx) {
    throw new Error("useCalendarBooking se lahko uporabi samo znotraj CalendarBookingProvider");
  }
  return ctx;
}

// Ovija koledarski razdelek na /owner - zagotavlja openSlot IN izriše sam
// modal (position: fixed, isti "klik zunaj zapre" vzorec kot
// appointment-note-button.tsx), ki se prikaže šele, ko je prefill nastavljen.
// Ločeno od AppointmentsHeader-jevega OBSTOJEČEGA "+ Dodaj termin ročno"
// (ta ostane nespremenjen, inline, v svojem lastnem stanju) - to je nov,
// vzporeden vstop v ISTO ManualBookingForm komponento.
export function CalendarBookingProvider({
  salonId,
  salonHours,
  children,
}: {
  salonId: string;
  salonHours: SalonDayHours[] | null;
  children: ReactNode;
}) {
  const [prefill, setPrefill] = useState<SlotPrefill | null>(null);

  return (
    <CalendarBookingContext.Provider value={{ openSlot: setPrefill }}>
      {children}
      {prefill && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPrefill(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[90vh] overflow-y-auto"
          >
            <ManualBookingForm
              initialDate={prefill.date}
              initialTime={prefill.time}
              initialEmployeeId={prefill.employeeId}
              salonId={salonId}
              salonHours={salonHours}
              onClose={() => setPrefill(null)}
            />
          </div>
        </div>
      )}
    </CalendarBookingContext.Provider>
  );
}
