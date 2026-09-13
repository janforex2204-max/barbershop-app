"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Scissors } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { HOURS, todayISO, dayLabel, upcomingBusinessWeeks } from "@/lib/constants";
import DatePicker from "./date-picker";
import { bookAppointment as bookAppointmentAction, joinWaitlist as joinWaitlistAction } from "./actions";

type Service = { id: string; name: string };
type BookingForm = { name: string; phone: string; service: string; time: string };
type WaitForm = { name: string; phone: string; service: string };

// Prvi razpoložljivi delovni dan (torek-sobota) - privzeto izbrani datum.
const INITIAL_DATE = upcomingBusinessWeeks()[0]?.dates[0] ?? todayISO();

export default function BookingPage({
  slug,
  salonId,
  salonName,
}: {
  slug: string;
  salonId: string;
  salonName: string;
}) {
  // createClient() vrne NOV objekt ob vsakem klicu - če bi ga klicali direktno
  // v telesu komponente, bi bil "supabase" spodaj v deps useEffect-ov vsakič
  // drugačen in bi se ti sprožali ob VSAKEM rerenderju (ne le ob dejanski
  // spremembi datuma/salona), kar je odprlo pot do prekrivajočih se (race)
  // klicev. useState(() => ...) ga ustvari samo enkrat.
  const [supabase] = useState(() => createClient());

  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState(false);

  const [selectedDate, setSelectedDate] = useState(INITIAL_DATE);
  const [takenTimes, setTakenTimes] = useState<Set<string>>(new Set());
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotsError, setSlotsError] = useState(false);
  // Vedno kaže na TRENUTNO izbrani datum - uporabljeno za zavrnitev
  // "zastarelih" odgovorov, če stranka hitro preklaplja med dnevi in starejši
  // klic (za prej izbrani dan) pride nazaj PO novejšem.
  const latestDateRef = useRef(INITIAL_DATE);
  // Poveča se ob kliku na "Poskusi znova" - v deps spodnjega useEffect-a, da
  // gumb lahko ponovno sproži nalaganje storitev (loadAvailability za
  // termine kliče uporabnik neposredno, ker je to že samostojna funkcija).
  const [servicesRetryTick, setServicesRetryTick] = useState(0);

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

  // Storitve TEGA salona iz baze - naloži enkrat.
  // Promise.resolve(...).catch(...) je namenoma tu: supabase-js poizvedba
  // sicer ob NAPAKAH API-ja (npr. RLS, napačen stolpec) vrne { error } in se
  // ne "zavrne" (reject) - ampak ob pravi omrežni napaki (odjava, DNS,
  // Supabase projekt, ki se ravno "prebuja" po neaktivnosti, PostgREST
  // shema-cache napaka tik po migraciji - to smo dejansko že videli v
  // dev logih za drugo tabelo) PA se obljuba lahko zavrne. Brez .catch tu bi
  // takrat setServicesLoading(false) NIKOLI ne bil klican in "Nalagam proste
  // termine..." bi obtičalo za vedno, tudi po osvežitvi strani.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve(
      supabase
        .from("services")
        .select("id, name")
        .eq("salon_id", salonId)
        .eq("active", true)
        .order("sort_order", { ascending: true })
    )
      .catch((err) => ({ data: null, error: err }))
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          console.error("Napaka pri nalaganju storitev:", error);
          setServicesError(true);
        } else {
          setServicesError(false);
          setServices(data);
          setForm((f) => ({ ...f, service: f.service || data[0]?.name || "" }));
        }
        setServicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [salonId, supabase, servicesRetryTick]);

  // Ista zaščita (Promise.resolve + .catch + "cancelled"/zastarel-odgovor
  // preverba) uporabljena za nalaganje zasedenosti - glej loadAvailability.
  const loadAvailability = useCallback(
    async (date: string) => {
      const { data, error } = await Promise.resolve(
        supabase
          .from("public_availability")
          .select("appointment_time")
          .eq("salon_id", salonId)
          .eq("appointment_date", date)
      ).catch((err) => ({ data: null, error: err }));

      // Stran je medtem preklopila na drug dan - ta odgovor je zastarel,
      // zavrzi ga (prepreči, da bi starejši, pozneje-prispeli odgovor
      // prepisal podatke za NOVEJŠI, že izbrani dan).
      if (date !== latestDateRef.current) return;

      if (error || !data) {
        console.error(`Napaka pri nalaganju zasedenosti (${date}):`, error);
        setSlotsError(true);
      } else {
        setSlotsError(false);
        setTakenTimes(new Set(data.map((r) => r.appointment_time)));
      }
      setSlotsLoading(false);
    },
    [salonId, supabase]
  );

  useEffect(() => {
    latestDateRef.current = selectedDate;
    // loadAvailability ne kliče setState sinhrono - vsi setX() klici v njej
    // so ŠELE po "await" (glej definicijo zgoraj), zato tu ni dejanskega
    // "cascading render" tveganja, na katero opozarja spodnje pravilo -
    // linter samo ne razlikuje med sinhronim in po-await delom funkcije.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAvailability(selectedDate);
  }, [selectedDate, loadAvailability]);

  function selectDate(date: string) {
    setSelectedDate(date);
    setForm((f) => ({ ...f, time: "" }));
    setSlotsLoading(true);
    setSlotsError(false);
  }

  function retryLoad() {
    setServicesLoading(true);
    setServicesError(false);
    setServicesRetryTick((n) => n + 1);
    setSlotsLoading(true);
    setSlotsError(false);
    loadAvailability(selectedDate);
  }

  const freeTimes = HOURS.filter((h) => !takenTimes.has(h));

  // Vpis gre prek server action-a (./actions.ts), ki salon_id VEDNO sam
  // izpelje iz `slug` na strežniku - `salonId` tu v komponenti se uporablja
  // samo za BRANJE (storitve/zasedenost), nikoli se ne pošlje kot vrednost,
  // ki bi jo strežnik za vpis "verjel" klientu.
  async function bookAppointment() {
    if (!form.name || !form.phone || !form.time) {
      showToast("Izpolni ime, telefon in izberi uro.");
      return;
    }
    setSubmitting(true);
    const { error } = await bookAppointmentAction(slug, {
      name: form.name,
      phone: form.phone,
      service: form.service,
      date: selectedDate,
      time: form.time,
    });
    setSubmitting(false);

    if (error) {
      showToast(
        error.includes("zaseden") ? error : "Napaka pri rezervaciji: " + error
      );
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
    const { error } = await joinWaitlistAction(slug, {
      name: waitForm.name,
      phone: waitForm.phone,
      service: waitForm.service,
      date: selectedDate,
    });
    setSubmitting(false);

    if (error) {
      showToast("Napaka: " + error);
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
              {salonName}
            </h1>
          </div>
          <nav className="flex gap-1 bg-ink-soft p-1 rounded-md">
            <span className="px-4 py-2 text-sm font-medium rounded bg-burgundy text-cream">
              Rezerviraj
            </span>
            <Link
              href="/owner"
              className="px-4 py-2 text-sm font-medium rounded text-cream-dim hover:text-cream transition-colors"
            >
              Nadzorna plošča
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-9 pb-20">
        <h2 className="font-display text-xl font-semibold mb-1 text-cream">
          Izberi dan
        </h2>
        <DatePicker selectedDate={selectedDate} onSelect={selectDate} />

        {slotsError || servicesError ? (
          <div className="border border-border rounded-lg p-5">
            <p className="text-sm text-cream-muted mb-3">
              Prišlo je do začasne napake pri nalaganju prostih terminov.
              Poskusi znova.
            </p>
            <button
              onClick={retryLoad}
              className="px-4 py-2 rounded-md border border-border text-cream text-sm font-medium cursor-pointer hover:bg-ink-soft"
            >
              Poskusi znova
            </button>
          </div>
        ) : slotsLoading || servicesLoading ? (
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
