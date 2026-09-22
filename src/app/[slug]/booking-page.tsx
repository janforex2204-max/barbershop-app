"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Scissors, Copy, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/theme-toggle";
import { GoogleIcon, AppleIcon } from "@/components/brand-icons";
import BarberPoleWatermark from "./barber-pole-watermark";
import {
  todayISO,
  dayLabel,
  formatPrice,
  formatDuration,
  upcomingBusinessWeeks,
  isValidCustomerName,
  isValidPhone,
  isValidEmail,
  resolveSalonTheme,
  buildGoogleCalendarUrl,
  downloadIcsFile,
  bookingManageUrl,
  type CalendarEvent,
} from "@/lib/constants";
import {
  resolveDayWindow,
  computeFreeSlots,
  DEFAULT_SERVICE_DURATION_MINUTES,
  type BusyInterval,
} from "@/lib/availability";
import type { SalonDayHours } from "@/types/database.types";
import DatePicker from "./date-picker";
import {
  bookAppointment as bookAppointmentAction,
  joinWaitlist as joinWaitlistAction,
} from "./actions";

type Service = {
  id: string;
  name: string;
  price: number | null;
  duration_minutes: number | null;
  category: string | null;
};

// Samo "15,00 €, 30 min" del (brez imena) - za grupiran seznam spodaj, kjer
// je ime storitve že prikazano ločeno. Vsak del izpisan SAMO, če je lastnik
// dejansko nastavljen (glej /owner/services), nikoli "0,00 €"/"0 min".
function serviceDetails(s: Service): string {
  return [
    s.price ? formatPrice(s.price) : null,
    s.duration_minutes ? formatDuration(s.duration_minutes) : null,
  ]
    .filter(Boolean)
    .join(", ");
}

// "Striženje - 15,00 €, 30 min" - polna oznaka, uporabljena kjer ime in
// podrobnosti nista prikazana ločeno (čakalna lista spodaj).
function serviceLabel(s: Service) {
  const details = serviceDetails(s);
  return details ? `${s.name} - ${details}` : s.name;
}

// "Striženje - 15,00 €" - BREZ trajanja, za stranski povzetek (glej
// "Pregled termina" spodaj), kjer je trajanje prikazano v svoji LASTNI
// vrstici (isti vzorec kot ločena Datum/Ura rezervacije), ne stlačeno v isto
// vrstico kot ime/cena.
function serviceNameAndPrice(s: Service): string {
  return s.price ? `${s.name} - ${formatPrice(s.price)}` : s.name;
}

// Storitve razvrsti v skupine po category, v vrstnem redu PRVEGA POJAVA
// znotraj že obstoječega sort_order (spoštuje lastnikov ročni vrstni red -
// ni dodatnega UI-ja za "vrstni red skupin"). Storitve BREZ kategorije
// (null) pristanejo v skupini "Ostalo" na dnu, ne glede na to, kje bi se
// sicer po sort_order pojavile.
function groupServicesByCategory(
  services: Service[]
): { category: string | null; services: Service[] }[] {
  const order: (string | null)[] = [];
  const byCategory = new Map<string | null, Service[]>();

  for (const s of services) {
    const key = s.category ?? null;
    if (!byCategory.has(key)) {
      order.push(key);
      byCategory.set(key, []);
    }
    byCategory.get(key)!.push(s);
  }

  const named = order.filter((key) => key !== null);
  const finalOrder = byCategory.has(null) ? [...named, null] : named;
  return finalOrder.map((key) => ({ category: key, services: byCategory.get(key)! }));
}

type BookingForm = { name: string; phone: string; email: string; service: string; time: string };
type WaitForm = { name: string; phone: string; service: string };

// Vodni žig samo za ta konkreten salon (glej barber-pole-watermark.tsx) - ne
// splošna platformska funkcija, zato preverjamo dobesedni slug, ne kake
// nastavitve salona v bazi.
const BARBER_POLE_WATERMARK_SLUG = "barbershop-pr-kljuni";

// Prvi razpoložljivi delovni dan (torek-sobota) - privzeto izbrani datum.
const INITIAL_DATE = upcomingBusinessWeeks()[0]?.dates[0] ?? todayISO();

// Vsi datumi, ki jih DatePicker ponuja (isti nabor, iz istega izvora) - prvi
// in zadnji tvorita razpon za EN sam poizvedbo, ki naenkrat naloži
// zasedenost za CEL prikazan koledar (glej loadAllAvailability spodaj).
const ALL_DATES = upcomingBusinessWeeks().flatMap((w) => w.dates);

export default function BookingPage({
  slug,
  salonId,
  salonName,
  salonHours,
  salonCategory,
  salonAddress,
}: {
  slug: string;
  salonId: string;
  salonName: string;
  salonHours: SalonDayHours[] | null;
  salonCategory: string | null;
  salonAddress: string | null;
}) {
  const salonTheme = resolveSalonTheme(salonCategory);
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
  // Zasedeni intervali (čas + trajanje), NE samo množica zasedenih TOČNIH
  // časov - potrebno za izračun prekrivanja glede na trajanje IZBRANE
  // storitve (glej computeFreeSlots spodaj).
  const [busy, setBusy] = useState<BusyInterval[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotsError, setSlotsError] = useState(false);
  // Vedno kaže na TRENUTNO izbrani datum - uporabljeno za zavrnitev
  // "zastarelih" odgovorov, če stranka hitro preklaplja med dnevi in starejši
  // klic (za prej izbrani dan) pride nazaj PO novejšem.
  const latestDateRef = useRef(INITIAL_DATE);
  // Predpomnilnik zasedenosti po datumu (v ref-u, ne state - pisanje sem NE
  // sme sprožiti rerenderja, ker se polni v enem samem "bulk" klicu za VES
  // prikazan koledar - glej loadAllAvailability spodaj). Ob izbiri
  // kateregakoli datuma iz koledarja se termini zato prikažejo TAKOJ (brez
  // "Nalagam..."), v ozadju pa se ta datum vseeno tiho osveži
  // (stale-while-revalidate), ker se zasedenost lahko medtem spremeni (druga
  // stranka je rezervirala termin).
  const availabilityCacheRef = useRef<Map<string, BusyInterval[]>>(new Map());
  // Poveča se ob kliku na "Poskusi znova" - v deps spodnjega useEffect-a, da
  // gumb lahko ponovno sproži nalaganje storitev (loadAvailability za
  // termine kliče uporabnik neposredno, ker je to že samostojna funkcija).
  const [servicesRetryTick, setServicesRetryTick] = useState(0);

  const [form, setForm] = useState<BookingForm>({
    name: "",
    phone: "",
    email: "",
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
  // Postavljeno po uspešni rezervaciji - prikaže potrditveno stran namesto
  // rezervacijskega obrazca (glej spodaj), z gumboma "Dodaj v koledar".
  // Shranimo podatke, ne samo bool, ker jih confirmedBooking prikaz/gumba
  // potrebujeta tudi PO tem, ko selectedService/form.time zgoraj že
  // resetiramo za morebitno naslednjo rezervacijo.
  const [confirmedBooking, setConfirmedBooking] = useState<CalendarEvent | null>(null);
  // Token te KONKRETNE rezervacije (glej bookAppointment v ./actions.ts) -
  // avtorizacija za /rezervacija/[token], kjer stranka kasneje sama upravlja
  // svoj termin (odpove/prenaroči). Ločeno stanje od confirmedBooking (ki ga
  // uporabljajo tudi Google/Apple koledar gumba in NE potrebuje tokena).
  const [confirmedToken, setConfirmedToken] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

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
  //
  // Prehodna varovalka: dokler `services.price`/`duration_minutes` morda še
  // nista dodana v produkcijsko bazo (supabase/schema.sql migracija je bila
  // poslana, a še ni bila zagnana - glej pogovor s Claude), bi "column ...
  // does not exist" (42703) tu obrnil CELOTNO javno rezervacijsko stran v
  // napako, čeprav gre samo za manjkajoč cenik/trajanje. Če pride TA
  // specifična napaka, poskusi še enkrat brez obeh (cene/trajanje se
  // preprosto ne prikažejo, dokler stolpca ne obstajata) - bolje delujoča
  // rezervacija brez njih kot popolnoma pokvarjena stran.
  useEffect(() => {
    let cancelled = false;

    async function loadServices() {
      let { data, error } = await Promise.resolve(
        supabase
          .from("services")
          .select("id, name, price, duration_minutes, category")
          .eq("salon_id", salonId)
          .eq("active", true)
          .order("sort_order", { ascending: true })
      ).catch((err) => ({ data: null, error: err }));

      if (error?.code === "42703") {
        console.error(
          "services.price/duration_minutes/category še ne obstajajo v bazi (manjkajoča migracija) - nadaljujem brez njih."
        );
        const fallback = await Promise.resolve(
          supabase
            .from("services")
            .select("id, name")
            .eq("salon_id", salonId)
            .eq("active", true)
            .order("sort_order", { ascending: true })
        ).catch((err) => ({ data: null, error: err }));
        data =
          fallback.data?.map((s) => ({
            ...s,
            price: null,
            duration_minutes: null,
            category: null,
          })) ?? null;
        error = fallback.error;
      }

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
    }

    loadServices();
    return () => {
      cancelled = true;
    };
  }, [salonId, supabase, servicesRetryTick]);

  // Ista zaščita (Promise.resolve + .catch + "cancelled"/zastarel-odgovor
  // preverba) uporabljena za nalaganje zasedenosti EN datum naenkrat -
  // uporabljeno za tiho osvežitev TRENUTNO gledanega dne (stale-while-
  // revalidate spodaj) in po uspešni rezervaciji/na "Poskusi znova". Za
  // PRVO nalaganje celega koledarja glej loadAllAvailability spodaj -
  // ta funkcija namenoma NI uporabljena za prehode med datumi, ker bi to
  // pomenilo novo omrežno poizvedbo ob vsakem kliku (prav to je bilo prej
  // opazno počasno pri preklapljanju na datum, ki še ni bil predpomnjen).
  // "background" samo zapiše v cache brez prikaza napake - klicatelj že ima
  // prikazane (morda zastarele) podatke, tiha osvežitev naj jih ne zamenja
  // z opozorilom o napaki.
  const loadAvailability = useCallback(
    async (date: string, opts?: { background?: boolean }) => {
      const background = opts?.background ?? false;
      let { data, error } = await Promise.resolve(
        supabase
          .from("public_availability")
          .select("appointment_time, duration_minutes")
          .eq("salon_id", salonId)
          .eq("appointment_date", date)
      ).catch((err) => ({ data: null, error: err }));

      // Ista 42703 varovalka kot pri storitvah zgoraj - dokler
      // public_availability view morda še ni osvežen z `duration_minutes`.
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
        console.error(`Napaka pri nalaganju zasedenosti (${date}):`, error);
        if (!background && date === latestDateRef.current) {
          setSlotsError(true);
          setSlotsLoading(false);
        }
        return;
      }

      // duration_minutes je lahko null pri obstoječih vrsticah, dokler
      // migracija ne požene backfilla - 60 min privzetek ujema prejšnjo
      // implicitno urno mrežo (glej supabase/schema.sql).
      const takenIntervals: BusyInterval[] = data.map((r) => ({
        time: r.appointment_time,
        durationMinutes: r.duration_minutes ?? 60,
      }));
      availabilityCacheRef.current.set(date, takenIntervals);

      // Stran je medtem preklopila na drug dan - ne dotikaj se vidnega
      // stanja za NEK DRUG dan, kot ga uporabnik trenutno gleda.
      if (date !== latestDateRef.current) return;

      setSlotsError(false);
      setBusy(takenIntervals);
      setSlotsLoading(false);
    },
    [salonId, supabase]
  );

  // Naloži zasedenost za CEL prikazan koledar (vseh ~24 delovnih dni iz
  // ALL_DATES) v ENI sami poizvedbi, ob prvem obisku strani - isti pristop
  // kot mesečni pregled na /owner (glej owner/page.tsx: ena poizvedba za cel
  // mesec, ne po dnevih). To predpolni celoten cache PREDEN uporabnik sploh
  // utegne kliknit na katerikoli datum, zato je vsak klik na DatePicker od
  // tu naprej trenuten (bere iz cache-a), ne glede na to, ali je datum
  // "sosednji" prej obiskanemu ali ne.
  const loadAllAvailability = useCallback(async () => {
    const from = ALL_DATES[0];
    const to = ALL_DATES[ALL_DATES.length - 1];
    if (!from || !to) return;

    // Prazen seznam za VSAK datum najprej - datum brez rezervacij mora v
    // cache-u obstajati kot "že naložen" (prazna zasedenost), sicer bi ga
    // selectDate spodaj obravnaval kot "še ni v cache-u" in prikazal
    // nepotreben "Nalagam...".
    for (const date of ALL_DATES) {
      if (!availabilityCacheRef.current.has(date)) {
        availabilityCacheRef.current.set(date, []);
      }
    }

    let { data, error } = await Promise.resolve(
      supabase
        .from("public_availability")
        .select("appointment_date, appointment_time, duration_minutes")
        .eq("salon_id", salonId)
        .gte("appointment_date", from)
        .lte("appointment_date", to)
    ).catch((err) => ({ data: null, error: err }));

    // Ista 42703 varovalka kot v loadAvailability zgoraj.
    if (error?.code === "42703") {
      const fallback = await Promise.resolve(
        supabase
          .from("public_availability")
          .select("appointment_date, appointment_time")
          .eq("salon_id", salonId)
          .gte("appointment_date", from)
          .lte("appointment_date", to)
      ).catch((err) => ({ data: null, error: err }));
      data = fallback.data?.map((r) => ({ ...r, duration_minutes: null })) ?? null;
      error = fallback.error;
    }

    if (error || !data) {
      console.error("Napaka pri nalaganju zasedenosti za koledar:", error);
      // Bulk klic ni uspel - vseeno poskusi naložiti VSAJ trenutno gledani
      // dan posamično, da uporabnik ni popolnoma blokiran.
      loadAvailability(latestDateRef.current);
      return;
    }

    for (const row of data) {
      availabilityCacheRef.current.get(row.appointment_date)?.push({
        time: row.appointment_time,
        durationMinutes: row.duration_minutes ?? 60,
      });
    }

    const current = availabilityCacheRef.current.get(latestDateRef.current);
    if (current) {
      setSlotsError(false);
      setBusy(current);
      setSlotsLoading(false);
    }
  }, [salonId, supabase, loadAvailability]);

  useEffect(() => {
    loadAllAvailability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId, supabase]);

  useEffect(() => {
    latestDateRef.current = selectedDate;
    // Tiha osvežitev (stale-while-revalidate) za novoizbrani dan - podatki
    // so že v cache-u iz bulk klica zgoraj (ali iz prejšnjega obiska tega
    // dne), to samo poskrbi, da se morebitna medtemska rezervacija druge
    // stranke odraža brez ponovnega "Nalagam...".
    loadAvailability(selectedDate, { background: true });
  }, [selectedDate, loadAvailability]);

  function selectDate(date: string) {
    setSelectedDate(date);
    setForm((f) => ({ ...f, time: "" }));
    const cached = availabilityCacheRef.current.get(date);
    if (cached) {
      // Že prednaloženo (ali prej obiskano) - prikaži TAKOJ, brez "Nalagam...".
      // Zgornji useEffect bo podatke v ozadju vseeno osvežil.
      setBusy(cached);
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

  // Trajanje TRENUTNO izbrane storitve - prosti termini se preračunajo, ko
  // stranka zamenja storitev (glej selectedService spodaj), ne samo ob
  // menjavi dneva. Privzetek, če storitev nima nastavljenega trajanja
  // (services.duration_minutes je null) ali ga sploh (še) ni med storitvami.
  const selectedService = services.find((s) => s.name === form.service);
  const selectedServiceDuration =
    selectedService?.duration_minutes ?? DEFAULT_SERVICE_DURATION_MINUTES;

  const dayWindow = resolveDayWindow(salonHours, selectedDate);
  const freeTimes = computeFreeSlots(dayWindow, busy, selectedServiceDuration);

  // Poišče prvi PRIHODNJI dan (znotraj že prikazanega koledarja) z vsaj enim
  // prostim terminom za TRENUTNO izbrano storitev - bere iz že napolnjenega
  // cache-a (glej loadAllAvailability zgoraj), zato brez nove omrežne
  // poizvedbe. Morda rahlo zastarelo za dneve, ki jih stranka še ni
  // obiskala, a selectDate spodaj tako ali tako sproži tiho osvežitev.
  function findNextAvailableDate(): string | null {
    const idx = ALL_DATES.indexOf(selectedDate);
    for (let i = idx + 1; i < ALL_DATES.length; i++) {
      const date = ALL_DATES[i];
      const cachedBusy = availabilityCacheRef.current.get(date) ?? [];
      const window = resolveDayWindow(salonHours, date);
      if (computeFreeSlots(window, cachedBusy, selectedServiceDuration).length > 0) {
        return date;
      }
    }
    return null;
  }

  function jumpToNextAvailable() {
    const next = findNextAvailableDate();
    if (next) {
      selectDate(next);
    } else {
      showToast("V prikazanem obdobju ni prostih terminov za izbrano storitev.");
    }
  }

  const serviceGroups = groupServicesByCategory(services);

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
    if (form.email && !isValidEmail(form.email)) {
      showToast("Email naslov ni veljaven (ali pusti polje prazno).");
      return;
    }
    setSubmitting(true);
    const { error, token } = await bookAppointmentAction(slug, {
      name: form.name,
      phone: form.phone,
      email: form.email || undefined,
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
    setConfirmedBooking({
      title: selectedService ? selectedService.name : form.service,
      date: selectedDate,
      time: form.time,
      durationMinutes: selectedServiceDuration,
      location: salonAddress ? `${salonName}, ${salonAddress}` : salonName,
    });
    setConfirmedToken(token ?? null);
    setLinkCopied(false);
    setForm((f) => ({ ...f, name: "", phone: "", email: "", time: "" }));
    loadAvailability(selectedDate);
  }

  async function copyManageLink() {
    if (!confirmedToken) return;
    try {
      await navigator.clipboard.writeText(bookingManageUrl(confirmedToken));
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      showToast("Kopiranje ni uspelo - povezavo označi in kopiraj ročno.");
    }
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
    showToast("Obvestili te bomo, če se kaj sprosti.");
  }

  return (
    <div data-theme={salonTheme} className="relative min-h-screen bg-ink font-sans">
      {slug === BARBER_POLE_WATERMARK_SLUG && <BarberPoleWatermark />}
      <header className="relative border-b border-border px-6 py-7">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Scissors size={22} className="text-gold" />
            <h1 className="font-display text-2xl font-semibold tracking-tight text-cream">
              {salonName}
            </h1>
          </div>
          {/* Ločeno od naslova salona, v zgornjem desnem kotu - z lastnim
              robom/ozadjem (namesto privzetega diskretnega videza drugod, glej
              theme-toggle.tsx), da je na tej JAVNI strani na prvi pogled jasno
              klikljiv gumb, ne le dekorativna ikona ob imenu. Osebni preklop
              svetlo/temno nima učinka, ko je tema salona vsiljena prek
              data-theme zgoraj (nižje v drevesu vedno zmaga) - gumb bi bil
              samo zavajajoč mrtev kontrolnik. */}
          {!salonTheme && (
            <ThemeToggle className="border border-border bg-ink-field" />
          )}
          {/* Povezava na /owner ("Nadzorna plošča") je bila tu odstranjena -
              ta stran je JAVNA, namenjena strankam, ne lastniku salona. */}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-9 pb-20">
        {confirmedBooking ? (
          <div className="max-w-md mx-auto text-center border border-border rounded-lg p-8">
            <h2 className="font-display text-xl font-semibold mb-1 text-cream">
              Termin potrjen!
            </h2>
            <p className="text-sm text-cream-dim mb-1">{confirmedBooking.title}</p>
            <p className="text-sm text-cream-dim mb-6">
              {dayLabel(confirmedBooking.date)} ob {confirmedBooking.time}
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <a
                href={buildGoogleCalendarUrl(confirmedBooking)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-md border border-border text-cream text-sm font-medium cursor-pointer hover:bg-ink-soft"
              >
                <GoogleIcon size={16} /> Dodaj v Google koledar
              </a>
              <button
                type="button"
                onClick={() => downloadIcsFile(confirmedBooking)}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-md border border-border text-cream text-sm font-medium cursor-pointer hover:bg-ink-soft"
              >
                <AppleIcon size={16} /> Dodaj v Apple koledar
              </button>
            </div>

            {/* Povezava za samostojno upravljanje termina (odpoved/
                prenaročanje, glej /rezervacija/[token]/) - token pride iz
                bookAppointment (./actions.ts), zato ga tu samo prikažemo/
                kopiramo, ne generiramo. */}
            {confirmedToken && (
              <div className="mt-6 pt-6 border-t border-border-soft">
                <p className="text-xs text-cream-faint mb-2">
                  S to povezavo lahko kadarkoli odpoveš ali prenaročiš termin:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={bookingManageUrl(confirmedToken)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 min-w-0 px-3 py-2 rounded-md border border-border bg-ink-field text-cream-dim text-xs truncate"
                  />
                  <button
                    type="button"
                    onClick={copyManageLink}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-cream text-xs font-medium cursor-pointer hover:bg-ink-soft"
                  >
                    {linkCopied ? <Check size={14} /> : <Copy size={14} />}
                    {linkCopied ? "Kopirano" : "Kopiraj povezavo"}
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setConfirmedBooking(null)}
              className="mt-6 text-sm text-cream-faint hover:text-cream cursor-pointer underline"
            >
              Rezerviraj še en termin
            </button>
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-8 items-start">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold mb-1 text-cream">
              Izberi dan
            </h2>
            <DatePicker selectedDate={selectedDate} onSelect={selectDate} />

            {/* Storitev MORA biti izbrana PREDEN prikažemo proste termine - ti
                so zdaj odvisni od njenega trajanja (glej computeFreeSlots
                zgoraj), ne le od tega, kateri točni časi so že zasedeni. */}
            {!servicesLoading && !servicesError && services.length > 0 && (
              <div className="mb-6">
                <h2 className="font-display text-xl font-semibold mb-3 text-cream">
                  Izberi storitev
                </h2>
                <div className="space-y-5">
                  {serviceGroups.map((group) => (
                    <div key={group.category ?? "__none__"}>
                      {/* Naslov skupine samo, če jih je VEČ kot ena - sicer
                          bi za salone brez kategorij dobili odvečen "Ostalo"
                          naslov nad edinim (ploščatim) seznamom. */}
                      {serviceGroups.length > 1 && (
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gold">
                          {group.category ?? "Ostalo"}
                        </p>
                      )}
                      <div className="flex flex-col gap-2">
                        {group.services.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() =>
                              setForm((f) => ({ ...f, service: s.name, time: "" }))
                            }
                            className={`w-full flex items-center justify-between gap-3 rounded-md border px-3.5 py-2.5 text-left cursor-pointer transition-colors ${
                              form.service === s.name
                                ? "border-gold bg-selected text-cream"
                                : "border-border text-cream bg-transparent hover:bg-ink-soft"
                            }`}
                          >
                            <span className="text-sm font-medium">{s.name}</span>
                            {serviceDetails(s) && (
                              <span className="text-xs text-cream-dim whitespace-nowrap">
                                {serviceDetails(s)}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                  <input
                    type="email"
                    placeholder="E-pošta (neobvezno)"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className={inputClass}
                  />
                  <p className="text-xs text-cream-faint -mt-1.5 mb-2.5">
                    Neobvezno — prejmete potrditev in povezavo za odpoved/prenaročanje termina.
                  </p>
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
                  {/* Isto sporočilo za "popolnoma zaseden", "salon ta dan ne
                      dela" IN "izbrana storitev nikamor ne gre zraven" -
                      glej dayWindow/freeTimes zgoraj, razlog ni pomemben za
                      stranko, akcija (počakaj na seznamu) je ista. */}
                  Za izbrani dan trenutno ni prostih terminov. Povej nam, katero
                  storitev želiš, in te obvestimo, če se kaj sprosti.
                </p>
                <button
                  type="button"
                  onClick={jumpToNextAvailable}
                  className="w-full mb-4 py-2.5 rounded-md border border-gold text-gold text-sm font-semibold cursor-pointer hover:bg-selected transition-colors"
                >
                  Na prvi prosti termin →
                </button>
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
                      {serviceLabel(s)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={joinWaitlist}
                  disabled={submitting}
                  className="w-full py-3 rounded-md border-none bg-burgundy text-on-accent text-sm font-semibold cursor-pointer mt-1 disabled:opacity-60"
                >
                  Obvestite me, ko se sprosti termin
                </button>
              </div>
            )}
          </div>

          {/* Stranski povzetek - dopolnjuje se skozi korake (storitev ->
              termin), da stranka vedno vidi, kaj je že izbrala. Na mobilnem
              (pod lg:) grid pade na eno kolono in se prikaže POD glavnim
              tokom (naraven DOM vrstni red), ne nad njim - gre za povzetek
              PRED oddajo, ne za uvodno usmerjanje. top-24 namesto top-8, da
              ne lepi tik ob robu zaslona (glej pogovor s Claude - poskus s
              samodejnim "odlepljanjem" ob dnu strani je delal opazen skok, ko
              je zmanjkalo prostora za sticky - raje preprost, ves čas
              prilepljen panel z malo več zgornjega odmika). */}
          <aside className="border border-border rounded-lg p-5 lg:sticky lg:top-24">
            <h2 className="font-display text-lg font-semibold mb-4 text-cream">
              Pregled termina
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-cream-faint mb-0.5">
                  Storitev
                </p>
                <p className={selectedService ? "text-cream" : "text-cream-faint"}>
                  {selectedService ? serviceNameAndPrice(selectedService) : "Še ni izbrano"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-cream-faint mb-0.5">
                  Trajanje
                </p>
                <p
                  className={
                    selectedService?.duration_minutes ? "text-cream" : "text-cream-faint"
                  }
                >
                  {!selectedService
                    ? "Še ni izbrano"
                    : selectedService.duration_minutes
                      ? formatDuration(selectedService.duration_minutes)
                      : "Ni določeno"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-cream-faint mb-0.5">
                  Datum
                </p>
                <p className="text-cream">{dayLabel(selectedDate)}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-cream-faint mb-0.5">
                  Ura rezervacije
                </p>
                <p className={form.time ? "text-cream" : "text-cream-faint"}>
                  {form.time || "Še ni izbrano"}
                </p>
              </div>
            </div>
          </aside>
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
