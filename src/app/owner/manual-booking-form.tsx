"use client";

import { useActionState, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  HOURS,
  SHOP_NAME,
  dayLabel,
  isBusinessDay,
  nextBusinessDayOffsets,
  todayISO,
  whatsAppLink,
} from "@/lib/constants";
import { addManualAppointment, type ManualBookingState } from "./actions";

type Service = { id: string; name: string };

const FALLBACK_DATE = todayISO(nextBusinessDayOffsets(1)[0] ?? 0);
const initialState: ManualBookingState = {};

export default function ManualBookingForm({
  initialDate,
}: {
  initialDate?: string;
}) {
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [date, setDate] = useState(initialDate ?? FALLBACK_DATE);
  const [time, setTime] = useState("");
  const [takenTimes, setTakenTimes] = useState<Set<string>>(new Set());
  const [slotsLoading, setSlotsLoading] = useState(true);

  const [state, formAction, pending] = useActionState(
    addManualAppointment,
    initialState
  );

  // Storitve naloži enkrat, ko se obrazec prvič odpre.
  useEffect(() => {
    if (!open) return;
    supabase
      .from("services")
      .select("id, name")
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setServices(data);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Zasedenost izbranega dne - "loading"/reset se sproži v event handlerjih
  // (openForm/handleDateChange), efekt samo naredi poizvedbo.
  useEffect(() => {
    if (!open) return;
    supabase
      .from("public_availability")
      .select("appointment_time")
      .eq("appointment_date", date)
      .then(({ data, error }) => {
        if (!error && data) {
          setTakenTimes(new Set(data.map((r) => r.appointment_time)));
        }
        setSlotsLoading(false);
      });
  }, [open, date, supabase]);

  // Po uspešni oddaji znova naloži zasedenost za isti dan (termin je zdaj zaseden).
  useEffect(() => {
    if (!state.success) return;
    supabase
      .from("public_availability")
      .select("appointment_time")
      .eq("appointment_date", date)
      .then(({ data, error }) => {
        if (!error && data) {
          setTakenTimes(new Set(data.map((r) => r.appointment_time)));
        }
        setTime("");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function openForm() {
    setOpen(true);
    setSlotsLoading(true);
  }

  function handleDateChange(next: string) {
    setDate(next);
    setTime("");
    setSlotsLoading(true);
  }

  const freeTimes = HOURS.filter((h) => !takenTimes.has(h));
  const validDay = isBusinessDay(date);

  if (!open) {
    return (
      <button
        type="button"
        onClick={openForm}
        className="text-sm border border-border rounded-md px-3 py-1.5 hover:bg-ink-soft cursor-pointer"
      >
        + Dodaj termin ročno
      </button>
    );
  }

  return (
    <div className="border border-border rounded-lg p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-cream-dim">
          Ročni vnos termina (telefonska rezervacija)
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-cream-faint hover:text-cream cursor-pointer"
        >
          Zapri
        </button>
      </div>

      {state.success && state.booked && (
        <div className="mb-3 space-y-2">
          <p className="text-xs text-sage bg-[#16241a] border border-[#2a4a34] rounded-md px-3 py-2">
            Termin je bil dodan.
          </p>
          <a
            href={whatsAppLink(
              state.booked.phone,
              `Pozdravljen/a ${state.booked.name}, tvoja rezervacija je potrjena: ${dayLabel(
                state.booked.date
              )} ob ${state.booked.time}, ${state.booked.service} - ${SHOP_NAME}`
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
        <p className="text-xs text-rose bg-[#2A1616] border border-[#4A2626] rounded-md px-3 py-2 mb-3">
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
        <select name="service" required className={inputClass}>
          {services.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>

        <input
          type="date"
          name="appointment_date"
          value={date}
          min={todayISO()}
          onChange={(e) => handleDateChange(e.target.value)}
          className={inputClass}
        />

        {!validDay && (
          <p className="text-xs text-rose">
            Salon ta dan ne dela (odprto torek-sobota).
          </p>
        )}

        {validDay && (
          <div>
            <p className="text-xs text-cream-faint mb-1.5">
              {dayLabel(date)}
            </p>
            {slotsLoading ? (
              <p className="text-xs text-cream-dim">Nalagam proste termine...</p>
            ) : (
              <div className="grid grid-cols-5 gap-1.5">
                {HOURS.map((h) => {
                  const taken = takenTimes.has(h);
                  return (
                    <button
                      key={h}
                      type="button"
                      disabled={taken}
                      onClick={() => setTime(h)}
                      className={`py-2 text-xs rounded-md border cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                        time === h
                          ? "border-gold bg-[#3A2A1A] text-cream"
                          : "border-border text-cream bg-transparent"
                      }`}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <input type="hidden" name="appointment_time" value={time} />

        <button
          type="submit"
          disabled={pending || !validDay || !time || freeTimes.length === 0}
          className="w-full py-2.5 rounded-md border-none bg-burgundy text-cream text-sm font-semibold cursor-pointer mt-1 disabled:opacity-50"
        >
          Dodaj termin{time ? ` — ${time}` : ""}
        </button>
      </form>
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2 rounded-md border border-border bg-ink-field text-cream text-sm box-border";
