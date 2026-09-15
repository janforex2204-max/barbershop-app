"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Scissors } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/theme-toggle";
import BarberPoleWatermark from "./barber-pole-watermark";
import {
  HOURS,
  todayISO,
  dayLabel,
  upcomingBusinessWeeks,
  isValidCustomerName,
  isValidPhone,
} from "@/lib/constants";
import DatePicker from "./date-picker";
import { bookAppointment as bookAppointmentAction, joinWaitlist as joinWaitlistAction } from "./actions";

type Service = { id: string; name: string };
type BookingForm = { name: string; phone: string; service: string; time: string };
type WaitForm = { name: string; phone: string; service: string };

// Vodni žig samo za ta konkreten salon (glej barber-pole-watermark.tsx) - ne
// splošna platformska funkcija, zato preverjamo dobesedni slug, ne kake
// nastavitve salona v bazi.
const BARBER_POLE_WATERMARK_SLUG = "barbershop-pr-kljuni";

// Prvi razpoložljivi delovni dan (torek-sobota) - privzeto izbrani datum.
const INITIAL_DATE = upcomingBusinessWeeks()[0]?.dates[0] ?? todayISO();

// Vsi datumi, ki jih DatePicker ponuja (isti nabor, iz istega izvora) -
// uporabljeno za ugotavljanje "sosednjih" datumov pri prednalaganju
// zasedenosti v ozadju (glej prefetchNeighbors spodaj).
const ALL_DATES = upcomingBusinessWeeks().flatMap((w) => w.dates);

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
  // Predpomnilnik zasedenosti po datumu (v ref-u, ne state - branje/pisanje
  // sem NE sme sprožiti rerenderja, saj se med drugim uporablja tudi za tihe
  // prednalaganje SOSEDNJIH datumov, ki jih uporabnik še ne gleda). Ob izbiri
  // že predpomnjenega datuma se termini prikažejo TAKOJ (brez "Nalagam..."),
  // v ozadju pa se podatki vseeno osvežijo (stale-while-revalidate), ker se
  // zasedenost lahko medtem spremeni (druga stranka je rezervirala termin).
  const availabilityCacheRef = useRef<Map<string, Set<string>>>(new Map());
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
  // preverba) uporabljena za nalaganje zasedenosti. "background" (za tiho
  // prednalaganje sosednjih dni) samo zapiše v cache, NIKOLI ne dotakne
  // slotsLoading/slotsError/takenTimes - te se posodobijo le, če je `date`
  // (še vedno) tisti, ki ga uporabnik trenutno gleda.
  const loadAvailability = useCallback(
    async (date: string, opts?: { background?: boolean }) => {
      const background = opts?.background ?? false;
      const { data, error } = await Promise.resolve(
        supabase
          .from("public_availability")
          .select("appointment_time")
          .eq("salon_id", salonId)
          .eq("appointment_date", date)
      ).catch((err) => ({ data: null, error: err }));

      if (error || !data) {
        console.error(`Napaka pri nalaganju zasedenosti (${date}):`, error);
        if (!background && date === latestDateRef.current) {
          setSlotsError(true);
          setSlotsLoading(false);
        }
        return;
      }

      const taken = new Set(data.map((r) => r.appointment_time));
      availabilityCacheRef.current.set(date, taken);

      // Stran je medtem preklopila na drug dan (ali gre za tiho prednalaganje
      // sosednjega dne) - ne dotikaj se vidnega stanja za NEK DRUG dan.
      if (date !== latestDateRef.current) return;

      setSlotsError(false);
      setTakenTimes(taken);
      setSlotsLoading(false);
    },
    [salonId, supabase]
  );

  // Po uspešnem nalaganju trenutnega dne tiho (brez loading/error stanja)
  // prednaloži sosednja datuma v koledarju - če jih stranka nato izbere, so
  // termini že v cache-u in se prikažejo takoj, brez čakanja na omrežje.
  const prefetchNeighbors = useCallback(
    (date: string) => {
      const idx = ALL_DATES.indexOf(date);
      if (idx === -1) return;
      for (const neighbor of [ALL_DATES[idx - 1], ALL_DATES[idx + 1]]) {
        if (neighbor && !availabilityCacheRef.current.has(neighbor)) {
          loadAvailability(neighbor, { background: true });
        }
      }
    },
    [loadAvailability]
  );

  useEffect(() => {
    latestDateRef.current = selectedDate;
    loadAvailability(selectedDate).then(() => prefetchNeighbors(selectedDate));
  }, [selectedDate, loadAvailability, prefetchNeighbors]);

  function selectDate(date: string) {
    setSelectedDate(date);
    setForm((f) => ({ ...f, time: "" }));
    const cached = availabilityCacheRef.current.get(date);
    if (cached) {
      // Že prednaloženo (ali prej obiskano) - prikaži TAKOJ, brez "Nalagam...".
      // Zgornji useEffect bo podatke v ozadju vseeno osvežil.
      setTakenTimes(cached);
      setSlotsLoading(false);
      setSlotsError(false);
    } else {
      setSlotsLoading(true);
      setSlotsError(false);
    }
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
    if (!isValidCustomerName(form.name)) {
      showToast('Vnesi ime in priimek (vsaj 3 znaki, npr. "Jan Novak").');
      return;
    }
    if (!isValidPhone(form.phone)) {
      showToast("Vnesi veljavno telefonsko številko (npr. 040 123 456).");
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
    if (!isValidCustomerName(waitForm.name)) {
      showToast('Vnesi ime in priimek (vsaj 3 znaki, npr. "Jan Novak").');
      return;
    }
    if (!isValidPhone(waitForm.phone)) {
      showToast("Vnesi veljavno telefonsko številko (npr. 040 123 456).");
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
    <div className="relative min-h-screen bg-ink font-sans">
      {slug === BARBER_POLE_WATERMARK_SLUG && <BarberPoleWatermark />}
      <header className="relative border-b border-border px-6 py-7">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Scissors size={22} className="text-gold" />
            <h1 className="font-display text-2xl font-semibold tracking-tight text-cream">
              {salonName}
            </h1>
            <ThemeToggle />
          </div>
          <nav className="flex gap-1 bg-ink-soft p-1 rounded-md">
            <span className="px-4 py-2 text-sm font-medium rounded bg-burgundy text-on-accent">
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
          <>
            <h2 className="font-display text-xl font-semibold mb-3 text-cream">
              Prosti termini
            </h2>
            <div className="grid grid-cols-5 gap-2 mb-7">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[42px] rounded-md border border-border bg-ink-soft animate-pulse"
                />
              ))}
            </div>
          </>
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
                      ? "border-gold bg-selected text-cream"
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
                type="tel"
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
                className="w-full py-3 rounded-md border-none bg-burgundy text-on-accent text-sm font-semibold cursor-pointer mt-1 disabled:opacity-60"
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
              type="tel"
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
              className="w-full py-3 rounded-md border-none bg-burgundy text-on-accent text-sm font-semibold cursor-pointer mt-1 disabled:opacity-60"
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
