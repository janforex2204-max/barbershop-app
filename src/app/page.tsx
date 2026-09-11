"use client";

import { useCallback, useEffect, useState } from "react";
import { Scissors } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SHOP_NAME, HOURS, todayISO, dayLabel, upcomingBusinessWeeks } from "@/lib/constants";
import DatePicker from "./date-picker";

type Service = { id: string; name: string };
type BookingForm = { name: string; phone: string; service: string; time: string };
type WaitForm = { name: string; phone: string; service: string };

// Prvi razpoložljivi delovni dan (torek-sobota) - privzeto izbrani datum.
const INITIAL_DATE = upcomingBusinessWeeks()[0]?.dates[0] ?? todayISO();

export default function Home() {
  const supabase = createClient();

  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState(INITIAL_DATE);
  const [takenTimes, setTakenTimes] = useState<Set<string>>(new Set());
  const [slotsLoading, setSlotsLoading] = useState(true);

  const [form, setForm] = useState<BookingForm>({
    name: "",
    phone: "",
    service: "",
    time: "",
  });
  const [waitForm, setWaitForm] = useState<WaitForm>({
    name: "",
    phone: "",
    service: "vseeno",
  });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }, []);

  // Storitve iz baze - naloži enkrat.
  useEffect(() => {
    supabase
      .from("services")
      .select("id, name")
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) {
          setServices(data);
          setForm((f) => ({ ...f, service: f.service || data[0]?.name || "" }));
        }
        setServicesLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Zasedenost izbranega dne - naloži ob vsaki spremembi datuma.
  useEffect(() => {
    supabase
      .from("public_availability")
      .select("appointment_time")
      .eq("appointment_date", selectedDate)
      .then(({ data, error }) => {
        if (!error && data) {
          setTakenTimes(new Set(data.map((r) => r.appointment_time)));
        }
        setSlotsLoading(false);
      });
  }, [selectedDate, supabase]);

  async function loadAvailability(date: string) {
    setSlotsLoading(true);
    const { data, error } = await supabase
      .from("public_availability")
      .select("appointment_time")
      .eq("appointment_date", date);

    if (!error && data) {
      setTakenTimes(new Set(data.map((r) => r.appointment_time)));
    }
    setSlotsLoading(false);
  }

  function selectDate(date: string) {
    setSelectedDate(date);
    setForm((f) => ({ ...f, time: "" }));
    setSlotsLoading(true);
  }

  const freeTimes = HOURS.filter((h) => !takenTimes.has(h));

  async function bookAppointment() {
    if (!form.name || !form.phone || !form.time) {
      showToast("Izpolni ime, telefon in izberi uro.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("appointments").insert({
      customer_name: form.name,
      customer_phone: form.phone,
      service: form.service,
      appointment_date: selectedDate,
      appointment_time: form.time,
      status: "booked",
    });
    setSubmitting(false);

    if (error) {
      if (error.code === "23505") {
        showToast("Ta termin je bil pravkar zaseden. Izberi drugega.");
      } else {
        showToast("Napaka pri rezervaciji: " + error.message);
      }
      loadAvailability(selectedDate);
      return;
    }

    showToast(`Termin potrjen: ${form.time} na ${dayLabel(selectedDate)}`);
    setForm((f) => ({ ...f, name: "", phone: "", time: "" }));
    loadAvailability(selectedDate);
  }

  async function joinWaitlist() {
    if (!waitForm.name || !waitForm.phone) {
      showToast("Izpolni ime in telefon.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("waitlist").insert({
      customer_name: waitForm.name,
      customer_phone: waitForm.phone,
      preferred_date: selectedDate,
      service_preference: waitForm.service,
    });
    setSubmitting(false);

    if (error) {
      showToast("Napaka: " + error.message);
      return;
    }

    setWaitForm({ name: "", phone: "", service: "vseeno" });
    showToast("Obvestili te bomo, ko se kaj sprosti.");
  }

  return (
    <div className="min-h-screen bg-ink font-sans">
      <header className="border-b border-border px-6 py-7">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Scissors size={22} className="text-gold" />
            <h1 className="font-display text-2xl font-semibold tracking-tight text-cream">
              {SHOP_NAME}
            </h1>
          </div>
          <nav className="flex gap-1 bg-ink-soft p-1 rounded-md">
            <span className="px-4 py-2 text-sm font-medium rounded bg-burgundy text-cream">
              Rezerviraj
            </span>
            <a
              href="/owner"
              className="px-4 py-2 text-sm font-medium rounded text-cream-dim hover:text-cream transition-colors"
            >
              Nadzorna plošča
            </a>
          </nav>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-9 pb-20">
        <h2 className="font-display text-xl font-semibold mb-1 text-cream">
          Izberi dan
        </h2>
        <DatePicker selectedDate={selectedDate} onSelect={selectDate} />

        {slotsLoading || servicesLoading ? (
          <p className="text-sm text-cream-dim">Nalagam proste termine...</p>
        ) : freeTimes.length > 0 ? (
          <>
            <h2 className="font-display text-xl font-semibold mb-3 text-cream">
              Prosti termini
            </h2>
            <div className="grid grid-cols-5 gap-2 mb-7">
              {freeTimes.map((t) => (
                <button
                  key={t}
                  onClick={() => setForm((f) => ({ ...f, time: t }))}
                  className={`py-2.5 text-[13px] rounded-md cursor-pointer border transition-colors ${
                    form.time === t
                      ? "border-gold bg-[#3A2A1A] text-cream"
                      : "border-border text-cream bg-transparent"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="border border-border rounded-lg p-5">
              <input
                placeholder="Ime in priimek"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={inputClass}
              />
              <input
                placeholder="Telefon"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className={inputClass}
              />
              <select
                value={form.service}
                onChange={(e) => setForm((f) => ({ ...f, service: e.target.value }))}
                className={inputClass}
              >
                {services.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                onClick={bookAppointment}
                disabled={submitting}
                className="w-full py-3 rounded-md border-none bg-burgundy text-cream text-sm font-semibold cursor-pointer mt-1 disabled:opacity-60"
              >
                Rezerviraj termin{form.time ? ` — ${form.time}` : ""}
              </button>
            </div>
          </>
        ) : (
          <div className="border border-border rounded-lg p-5">
            <p className="text-sm text-cream-muted mb-4">
              Ta dan je popolnoma zaseden. Povej nam, katero storitev želiš, in
              te obvestimo, ko se kaj sprosti.
            </p>
            <input
              placeholder="Ime in priimek"
              value={waitForm.name}
              onChange={(e) => setWaitForm((f) => ({ ...f, name: e.target.value }))}
              className={inputClass}
            />
            <input
              placeholder="Telefon"
              value={waitForm.phone}
              onChange={(e) => setWaitForm((f) => ({ ...f, phone: e.target.value }))}
              className={inputClass}
            />
            <select
              value={waitForm.service}
              onChange={(e) => setWaitForm((f) => ({ ...f, service: e.target.value }))}
              className={inputClass}
            >
              <option value="vseeno">Vseeno katera storitev</option>
              {services.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              onClick={joinWaitlist}
              disabled={submitting}
              className="w-full py-3 rounded-md border-none bg-burgundy text-cream text-sm font-semibold cursor-pointer mt-1 disabled:opacity-60"
            >
              Obvesti me, ko se kaj sprosti
            </button>
          </div>
        )}
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-cream text-ink px-5 py-3 rounded-md text-sm font-medium shadow-lg max-w-[90%] text-center">
          {toast}
        </div>
      )}
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2.5 mb-2.5 rounded-md border border-border bg-ink-field text-cream text-sm box-border";
