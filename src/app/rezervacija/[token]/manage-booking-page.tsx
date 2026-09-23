"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/theme-toggle";
import DatePicker from "@/app/[slug]/date-picker";
import {
  dayLabel,
  formatDuration,
  resolveSalonTheme,
  isPastCancellationDeadline,
  CANCELLATION_NOTICE_HOURS,
} from "@/lib/constants";
import {
  resolveDayWindow,
  resolveDayBreak,
  computeFreeSlots,
  type BusyInterval,
} from "@/lib/availability";
import type { SalonDayHours, AppointmentStatus } from "@/types/database.types";
import { cancelBookingByToken, rescheduleBookingByToken } from "./actions";

type Appointment = {
  service: string;
  date: string;
  time: string;
  durationMinutes: number;
  status: AppointmentStatus;
  customerName: string;
};

export default function ManageBookingPage({
  token,
  appointment,
  salonId,
  salonName,
  salonHours,
  salonCategory,
}: {
  token: string;
  appointment: Appointment;
  salonId: string;
  salonName: string;
  salonHours: SalonDayHours[] | null;
  salonCategory: string | null;
}) {
  const salonTheme = resolveSalonTheme(salonCategory);
  const router = useRouter();
  // Glej isti komentar v booking-page.tsx - useState(() => ...) ustvari
  // klienta samo enkrat, da se useEffect/handlerji spodaj ne sprožajo znova
  // ob vsakem rerenderju.
  const [supabase] = useState(() => createClient());

  const [view, setView] = useState<"details" | "reschedule">("details");
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState(appointment.date);
  const [selectedTime, setSelectedTime] = useState("");
  const [busy, setBusy] = useState<BusyInterval[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);

  // Isti CANCELLATION_NOTICE_HOURS prag kot na strežniku (glej ./actions.ts)
  // - tu samo za UI (skrije/onemogoči gumbe pravočasno), strežnik je
  // dokončna avtoriteta (ponovno preveri isto pri dejanski oddaji).
  const canModify =
    appointment.status === "booked" &&
    !isPastCancellationDeadline(appointment.date, appointment.time);

  // Isti vzorec (Promise.resolve + .catch + 42703 fallback) kot
  // loadAvailability v booking-page.tsx.
  async function loadSlotsForDate(date: string) {
    setSlotsLoading(true);
    setSlotsError(false);
    let { data, error } = await Promise.resolve(
      supabase
        .from("public_availability")
        .select("appointment_time, duration_minutes")
        .eq("salon_id", salonId)
        .eq("appointment_date", date)
    ).catch((err) => ({ data: null, error: err }));

    if (error?.code === "42703") {
      const fallback = await Promise.resolve(
        supabase
          .from("public_availability")
          .select("appointment_time")
          .eq("salon_id", salonId)
          .eq("appointment_date", date)
      ).catch((err) => ({ data: null, error: err }));
      data = fallback.data?.map((r) => ({ ...r, duration_minutes: null })) ?? null;
      error = fallback.error;
    }

    if (error || !data) {
      setSlotsError(true);
      setSlotsLoading(false);
      return;
    }

    // Izloči SVOJ trenutni termin (na TA isti dan), da ga izračun
    // prekrivanja ne šteje kot "zaseden" - stranka lahko znova izbere svoj
    // sedanji čas, ne da bi ga izračun napačno blokiral.
    const filtered = data.filter(
      (r) => !(date === appointment.date && r.appointment_time === appointment.time)
    );

    setBusy(
      filtered.map((r) => ({
        time: r.appointment_time,
        durationMinutes: r.duration_minutes ?? 60,
      }))
    );
    setSlotsLoading(false);
  }

  function startReschedule() {
    setActionError(null);
    setSelectedDate(appointment.date);
    setSelectedTime("");
    setView("reschedule");
    loadSlotsForDate(appointment.date);
  }

  function selectDate(date: string) {
    setSelectedDate(date);
    setSelectedTime("");
    loadSlotsForDate(date);
  }

  const dayWindow = resolveDayWindow(salonHours, selectedDate);
  const dayBreak = resolveDayBreak(salonHours, selectedDate);
  const busyWithBreak = dayBreak ? [...busy, dayBreak] : busy;
  const freeTimes = computeFreeSlots(dayWindow, busyWithBreak, appointment.durationMinutes);

  async function submitReschedule() {
    if (!selectedTime) return;
    setRescheduling(true);
    setActionError(null);
    const { error } = await rescheduleBookingByToken(token, {
      date: selectedDate,
      time: selectedTime,
    });
    setRescheduling(false);
    if (error) {
      setActionError(error);
      return;
    }
    setView("details");
    router.refresh();
  }

  async function cancelBooking() {
    if (!window.confirm("Res želiš odpovedati ta termin?")) return;
    setCancelling(true);
    setActionError(null);
    const { error } = await cancelBookingByToken(token);
    setCancelling(false);
    if (error) {
      setActionError(error);
      return;
    }
    router.refresh();
  }

  return (
    <div data-theme={salonTheme} className="min-h-screen bg-ink font-sans">
      <header className="border-b border-border px-6 py-7">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <h1 className="font-display text-xl font-semibold text-cream">{salonName}</h1>
          {!salonTheme && <ThemeToggle className="border border-border bg-ink-field" />}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-9">
        <div className="border border-border rounded-lg p-6">
          {view === "details" ? (
            <>
              <h2 className="font-display text-lg font-semibold mb-4 text-cream">
                {appointment.customerName} - tvoja rezervacija
              </h2>
              <div className="space-y-3 text-sm mb-6">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-cream-faint mb-0.5">
                    Storitev
                  </p>
                  <p className="text-cream">{appointment.service}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-cream-faint mb-0.5">
                    Trajanje
                  </p>
                  <p className="text-cream">{formatDuration(appointment.durationMinutes)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-cream-faint mb-0.5">
                    Datum
                  </p>
                  <p className="text-cream capitalize">{dayLabel(appointment.date)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-cream-faint mb-0.5">
                    Ura rezervacije
                  </p>
                  <p className="text-cream">{appointment.time}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-cream-faint mb-0.5">
                    Status
                  </p>
                  <p className="text-cream">
                    {appointment.status === "booked"
                      ? "Potrjeno"
                      : appointment.status === "cancelled"
                        ? "Odpovedano"
                        : "Zapolnjeno"}
                  </p>
                </div>
              </div>

              {actionError && (
                <p className="text-sm text-rose bg-danger-bg border border-danger-border rounded-md px-3 py-2 mb-4">
                  {actionError}
                </p>
              )}

              {appointment.status === "cancelled" ? (
                <p className="text-sm text-cream-muted">Ta termin je bil odpovedan.</p>
              ) : appointment.status === "filled" ? (
                <p className="text-sm text-cream-muted">Ta termin je bil zapolnjen.</p>
              ) : !canModify ? (
                <p className="text-sm text-cream-muted">
                  Odpoved/prenaročanje je mogoče najkasneje {CANCELLATION_NOTICE_HOURS} ure pred
                  terminom. Za spremembo kontaktiraj salon neposredno.
                </p>
              ) : (
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={startReschedule}
                    className="flex-1 py-2.5 rounded-md border border-border text-cream text-sm font-medium cursor-pointer hover:bg-ink-soft"
                  >
                    Prenaroči
                  </button>
                  <button
                    type="button"
                    onClick={cancelBooking}
                    disabled={cancelling}
                    className="flex-1 py-2.5 rounded-md border border-rose text-rose text-sm font-medium cursor-pointer hover:bg-rose/10 disabled:opacity-60"
                  >
                    Odpovej
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setView("details")}
                className="flex items-center gap-1 text-sm text-cream-faint hover:text-cream cursor-pointer mb-4"
              >
                <ChevronLeft size={16} /> Nazaj
              </button>
              <h2 className="font-display text-lg font-semibold mb-3 text-cream">
                Izberi nov termin
              </h2>
              <DatePicker selectedDate={selectedDate} onSelect={selectDate} />

              {actionError && (
                <p className="text-sm text-rose bg-danger-bg border border-danger-border rounded-md px-3 py-2 mb-4">
                  {actionError}
                </p>
              )}

              {slotsError ? (
                <p className="text-sm text-cream-muted mb-4">
                  Prišlo je do začasne napake pri nalaganju prostih terminov.
                </p>
              ) : slotsLoading ? (
                <div className="grid grid-cols-4 gap-2 mb-6">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-[42px] rounded-md border border-border bg-ink-soft animate-pulse"
                    />
                  ))}
                </div>
              ) : freeTimes.length > 0 ? (
                <div className="grid grid-cols-4 gap-2 mb-6">
                  {freeTimes.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelectedTime(t)}
                      className={`py-2.5 text-[13px] rounded-md cursor-pointer border transition-colors ${
                        selectedTime === t
                          ? "border-gold bg-selected text-cream"
                          : "border-border text-cream bg-transparent"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-cream-muted mb-6">
                  Za izbrani dan ni prostih terminov za to storitev.
                </p>
              )}

              <button
                type="button"
                onClick={submitReschedule}
                disabled={!selectedTime || rescheduling}
                className="w-full py-3 rounded-md border-none bg-burgundy text-on-accent text-sm font-semibold cursor-pointer disabled:opacity-60"
              >
                Potrdi nov termin{selectedTime ? ` — ${selectedTime}` : ""}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
