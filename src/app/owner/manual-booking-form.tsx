"use client";

import { useActionState, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dayLabel, todayISO, whatsAppLink, bookingManageUrl } from "@/lib/constants";
import {
  resolveDayWindow,
  resolveDayBreak,
  computeFreeSlots,
  DEFAULT_SERVICE_DURATION_MINUTES,
} from "@/lib/availability";
import { busyForEmployee, type EmployeeBusyRow } from "@/lib/employee-availability";
import type { SalonDayHours } from "@/types/database.types";
import { addManualAppointment, type ManualBookingState } from "./actions";

type Service = { id: string; name: string; duration_minutes: number | null };
type Employee = { id: string; name: string; hours: SalonDayHours[] };

const initialState: ManualBookingState = {};

export default function ManualBookingForm({
  initialDate,
  salonId,
  salonHours,
  onClose,
}: {
  initialDate: string;
  salonId: string;
  salonHours: SalonDayHours[] | null;
  onClose: () => void;
}) {
  const supabase = createClient();

  const [services, setServices] = useState<Service[]>([]);
  const [service, setService] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState("");
  // Zasedeni intervali (čas + trajanje + kateremu zaposlenemu pripadajo) -
  // isti tip in isti izračun kot na javni strani (glej
  // src/lib/availability.ts, src/lib/employee-availability.ts), zato
  // lastnikov ročni vnos ne more več ustvariti prekrivanja, ki bi ga
  // /[slug] preprečil.
  const [busy, setBusy] = useState<EmployeeBusyRow[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);

  const [state, formAction, pending] = useActionState(
    addManualAppointment,
    initialState
  );

  // Čisti helper BREZ setState - vrne podatke ali null ob napaki, sam se ne
  // dotika komponentnega stanja. Vsak klicatelj (spodaj) se sam odloči, ali
  // je odgovor še relevanten (glej "cancelled" varovalko v obeh efektih -
  // isti vzorec kot loadServices/loadAvailability v [slug]/booking-page.tsx,
  // ki prepreči, da bi ZASTAREL odgovor prepisal novejše stanje). Ista 42703
  // varovalka kot na /[slug], dokler appointments.duration_minutes morda še
  // ni v produkcijski bazi.
  async function fetchBusy(forDate: string): Promise<EmployeeBusyRow[] | null> {
    let { data, error } = await supabase
      .from("public_availability")
      .select("appointment_time, duration_minutes, employee_id")
      .eq("salon_id", salonId)
      .eq("appointment_date", forDate);

    if (error?.code === "42703") {
      const fallback = await supabase
        .from("public_availability")
        .select("appointment_time")
        .eq("salon_id", salonId)
        .eq("appointment_date", forDate);
      data =
        fallback.data?.map((r) => ({ ...r, duration_minutes: null, employee_id: null })) ?? null;
      error = fallback.error;
    }

    if (error || !data) return null;
    return data.map((r) => ({
      time: r.appointment_time,
      durationMinutes: r.duration_minutes ?? 60,
      employeeId: r.employee_id ?? null,
    }));
  }

  // Storitve TEGA salona naloži enkrat, ko se panel odpre. Ista 42703
  // varovalka kot na /[slug] (glej [slug]/booking-page.tsx) - dokler
  // services.duration_minutes morda še ni v produkcijski bazi.
  useEffect(() => {
    let cancelled = false;

    async function loadServices() {
      let { data, error } = await supabase
        .from("services")
        .select("id, name, duration_minutes")
        .eq("salon_id", salonId)
        .eq("active", true)
        .order("sort_order", { ascending: true });

      if (error?.code === "42703") {
        const fallback = await supabase
          .from("services")
          .select("id, name")
          .eq("salon_id", salonId)
          .eq("active", true)
          .order("sort_order", { ascending: true });
        data = fallback.data?.map((s) => ({ ...s, duration_minutes: null })) ?? null;
        error = fallback.error;
      }

      if (cancelled) return;
      if (!error && data) {
        setServices(data);
        setService((current) => current || data[0]?.name || "");
      }
    }
    loadServices();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId]);

  // Aktivni zaposleni TEGA salona - naloži enkrat, ko se panel odpre (isti
  // vzorec kot loadServices zgoraj). 0 zaposlenih -> employeeId ostane "" in
  // spodnji izbirnik se sploh ne prikaže (vedenje identično kot pred to
  // funkcionalnostjo). Točno 1 aktiven -> tiho samodejno izbran, brez
  // vidnega izbirnika (glej pogovor s Claude - lastnik mora sebe dodati kot
  // zaposlenega, če tudi sam streže stranke, sicer ta samodejna izbira
  // napačno preusmeri vse ROČNE vnose na edinega dodanega zaposlenega).
  useEffect(() => {
    let cancelled = false;

    async function loadEmployees() {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, hours")
        .eq("salon_id", salonId)
        .eq("active", true)
        .order("sort_order", { ascending: true });

      if (cancelled) return;
      if (!error && data) {
        setEmployees(data);
        if (data.length === 1) setEmployeeId(data[0].id);
      }
    }
    loadEmployees();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId]);

  // Zasedenost izbranega dne PRI TEM SALONU - "loading"/reset se sproži v
  // handleDateChange, efekt samo naredi poizvedbo.
  useEffect(() => {
    let cancelled = false;
    fetchBusy(date).then((result) => {
      if (cancelled) return;
      if (result) setBusy(result);
      setSlotsLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, salonId]);

  // Po uspešni oddaji znova naloži zasedenost za isti dan (termin je zdaj zaseden).
  useEffect(() => {
    if (!state.success) return;
    let cancelled = false;
    fetchBusy(date).then((result) => {
      if (cancelled) return;
      if (result) setBusy(result);
      setTime("");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function handleDateChange(next: string) {
    setDate(next);
    setTime("");
    setSlotsLoading(true);
  }

  function handleServiceChange(next: string) {
    setService(next);
    setTime("");
  }

  function handleEmployeeChange(next: string) {
    setEmployeeId(next);
    setTime("");
  }

  const selectedService = services.find((s) => s.name === service);
  const selectedServiceDuration =
    selectedService?.duration_minutes ?? DEFAULT_SERVICE_DURATION_MINUTES;

  // Efektivni urnik - IZBRANEGA (ali samodejno edinega) zaposlenega, ne
  // salonov, brž ko je kdo konkreten v igri (glej src/lib/employee-availability.ts).
  const selectedEmployee = employees.find((e) => e.id === employeeId);
  const effectiveHours = selectedEmployee ? selectedEmployee.hours : salonHours;

  const dayWindow = resolveDayWindow(effectiveHours, date);
  const dayBreak = resolveDayBreak(effectiveHours, date);
  const busyForSelection = busyForEmployee(busy, employeeId || null, employees.length > 0);
  const busyWithBreak = dayBreak ? [...busyForSelection, dayBreak] : busyForSelection;
  const freeTimes = computeFreeSlots(dayWindow, busyWithBreak, selectedServiceDuration);
  const validDay = dayWindow !== null;

  return (
    <div className="border border-border rounded-lg bg-panel p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-cream-dim">
          Ročni vnos termina (telefonska rezervacija)
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-cream-faint hover:text-cream cursor-pointer"
        >
          Zapri
        </button>
      </div>

      {state.success && state.booked && (
        <div className="mb-3 space-y-2">
          <p className="text-xs text-sage bg-success-bg border border-success-border rounded-md px-3 py-2">
            Termin je bil dodan.
          </p>
          <a
            href={whatsAppLink(
              state.booked.phone,
              `Pozdravljen/a ${state.booked.name}, tvoja rezervacija je potrjena: ${dayLabel(
                state.booked.date
              )} ob ${state.booked.time}, ${state.booked.service}` +
                `${state.booked.employeeName ? ` pri ${state.booked.employeeName}` : ""} - ${state.booked.salonName}. ` +
                `Upravljaj svojo rezervacijo: ${bookingManageUrl(state.booked.token)}`
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 w-full py-2 rounded-md border border-sage text-sage text-xs font-medium hover:bg-sage/10"
          >
            <MessageCircle size={13} /> Pošlji potrditev
          </a>
        </div>
      )}
      {state.error && (
        <p className="text-xs text-rose bg-danger-bg border border-danger-border rounded-md px-3 py-2 mb-3">
          {state.error}
        </p>
      )}

      <form action={formAction} className="space-y-2.5">
        <input
          name="customer_name"
          placeholder="Ime in priimek"
          required
          className={inputClass}
        />
        <input
          name="customer_phone"
          placeholder="Telefon"
          required
          className={inputClass}
        />
        <select
          name="service"
          value={service}
          onChange={(e) => handleServiceChange(e.target.value)}
          required
          className={inputClass}
        >
          {services.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
              {s.duration_minutes ? ` (${s.duration_minutes} min)` : ""}
            </option>
          ))}
        </select>

        {/* Prikaže se SAMO pri 2+ aktivnih zaposlenih - pri 0 ostane
            employeeId "", pri 1 je tiho samodejno izbran (glej efekt
            zgoraj). Brez "name" - vrednost v FormData nosi skriti input
            spodaj, isti vzorec kot appointment_time (mreža gumbov ni
            naravno oddajna). */}
        {employees.length > 1 && (
          <select
            value={employeeId}
            onChange={(e) => handleEmployeeChange(e.target.value)}
            required
            className={inputClass}
          >
            <option value="" disabled>
              Izberi izvajalca
            </option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        )}
        <input type="hidden" name="employee_id" value={employeeId} />

        <input
          type="date"
          name="appointment_date"
          value={date}
          min={todayISO()}
          onChange={(e) => handleDateChange(e.target.value)}
          className={inputClass}
        />

        {!validDay && <p className="text-xs text-rose">Salon ta dan ne dela.</p>}

        {validDay && (
          <div>
            <p className="text-xs text-cream-faint mb-1.5">
              {dayLabel(date)}
            </p>
            {slotsLoading ? (
              <p className="text-xs text-cream-dim">Nalagam proste termine...</p>
            ) : freeTimes.length === 0 ? (
              <p className="text-xs text-cream-dim">
                Za izbrano storitev ta dan ni prostih terminov.
              </p>
            ) : (
              <div className="grid grid-cols-5 gap-1.5">
                {freeTimes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTime(t)}
                    className={`py-2 text-xs rounded-md border cursor-pointer transition-colors ${
                      time === t
                        ? "border-gold bg-selected text-cream"
                        : "border-border text-cream bg-transparent"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <input type="hidden" name="appointment_time" value={time} />

        <button
          type="submit"
          disabled={
            pending ||
            !validDay ||
            !time ||
            freeTimes.length === 0 ||
            (employees.length > 1 && !employeeId)
          }
          className="w-full py-2.5 rounded-md border-none bg-burgundy text-on-accent text-sm font-semibold cursor-pointer mt-1 disabled:opacity-50"
        >
          Dodaj termin{time ? ` — ${time}` : ""}
        </button>
      </form>
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2 rounded-md border border-border bg-ink-field text-cream text-sm box-border";
