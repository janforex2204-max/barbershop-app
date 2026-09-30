import { Fragment } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Clock, MessageCircle, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cancelAppointment, logout } from "./actions";
import {
  todayISO,
  dayLabel,
  monthOf,
  monthRange,
  weekStartOf,
  weekDates,
  whatsAppLink,
  bookingManageUrl,
  resolveSalonTheme,
  PLATFORM_URL,
} from "@/lib/constants";
import { nextAvailableDayAfterToday } from "@/lib/availability";
import type { WeekAppointment } from "@/lib/week-layout";
import { fraunces } from "@/lib/fonts";
import AppointmentsHeader from "./appointments-header";
import { CalendarBookingProvider } from "./calendar-booking-context";
import NotificationsPanel from "./notifications-panel";
import NotificationSettings from "./notification-settings";
import OwnerAutoRefresh from "./owner-auto-refresh";
import MonthCalendar from "./month-calendar";
import WeekCalendar from "./week-calendar";
import WaitlistOffer from "./waitlist-offer";
import WaitlistNotifyButton from "./waitlist-notify-button";
import LogoUpload from "./logo-upload";
import PoweredBy from "@/components/powered-by";
import ThemeToggle from "@/components/theme-toggle";
import {
  getCachedDayData,
  getCachedEmployeesList,
  getCachedMonthOverview,
  getCachedOwnerRow,
  getCachedTomorrowAppointments,
  getCachedWeekData,
} from "./cached-queries";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

// Skupini termine po zaposlenem - isti bucket-po-ključu vzorec (ohranjen
// vrstni red PRVE pojavitve, "brez zaposlenega" predal vedno ZADNJI) kot
// groupServicesByCategory v [slug]/booking-page.tsx, tu prevzet za
// employee_id namesto category. employeeNameById vsebuje VSE zaposlene
// (tudi deaktivirane) - obstoječi termin lahko kaže na zaposlenega, ki je
// bil medtem deaktiviran (glej pogovor s Claude, arhitekturni načrt), pa
// mora vseeno dobiti pravo ime, ne "Neznan zaposleni".
function groupByEmployee<T extends { employee_id: string | null }>(
  items: T[],
  employeeNameById: Map<string, string>
): { employeeId: string | null; employeeName: string; items: T[] }[] {
  const order: (string | null)[] = [];
  const byEmployee = new Map<string | null, T[]>();

  for (const item of items) {
    const key = item.employee_id;
    if (!byEmployee.has(key)) {
      order.push(key);
      byEmployee.set(key, []);
    }
    byEmployee.get(key)!.push(item);
  }

  const named = order.filter((key): key is string => key !== null);
  const finalOrder: (string | null)[] = byEmployee.has(null) ? [...named, null] : named;
  return finalOrder.map((key) => ({
    employeeId: key,
    employeeName: key ? (employeeNameById.get(key) ?? "Neznan zaposleni") : "Ni dodeljeno",
    items: byEmployee.get(key)!,
  }));
}

// Preklop teme + 4 navigacijski gumbi - EN vir resnice za seznam, izrisan
// DVAKRAT na klicnem mestu spodaj (glej pogovor s Claude): enkrat kot
// absolutno pozicioniran stranski stolpec ob glavi (xl+, dovolj prostora v
// robu), enkrat kot sklad V TOKU pod info blokom (pod xl, kjer stranski
// stolpec fizično ne bi imel prostora) - lastnik ni želel, da navpičen
// sklad znotraj same glave "raztegne" (podaljša) stran navzdol.
function OwnerHeaderControls({ salonTheme }: { salonTheme: "spa" | undefined }) {
  return (
    <>
      {/* Glej isto opombo v [slug]/booking-page.tsx - preklop nima učinka,
          ko je tema salona vsiljena prek data-theme. Večji (size 20) +
          border/bg-ink-field - na prvi pogled očitno klikljiv gumb, isti
          "opazen" vzorec kot že na /[slug] in /rezervacija/[token]. */}
      {!salonTheme && (
        <ThemeToggle size={20} className="border border-border bg-ink-field p-2" />
      )}
      {/* inline-flex + flex-col + items-stretch - vsi štirje elementi se
          raztegnejo na širino NAJŠIRŠEGA med njimi ("Storitve in cenik"),
          container pa se sam skrči na TO širino (shrink-to-fit).
          whitespace-nowrap prepreči lom besedila v 2 vrstici pri ozkih
          stolpcih - brez njega bi imeli gumbi RAZLIČNO višino. Gumb
          "Odjava" je edini v <form>, zato potrebuje w-full - Link elementa
          sta že neposredna flex elementa in se raztegneta samodejno. */}
      <div className="inline-flex flex-col items-stretch gap-2">
        <Link
          href="/owner/services"
          className="text-sm text-center whitespace-nowrap border border-border rounded-md px-3 py-1.5 hover:bg-ink-soft"
        >
          Storitve in cenik
        </Link>
        <Link
          href="/owner/hours"
          className="text-sm text-center whitespace-nowrap border border-border rounded-md px-3 py-1.5 hover:bg-ink-soft"
        >
          Delovni čas
        </Link>
        <Link
          href="/owner/employees"
          className="text-sm text-center whitespace-nowrap border border-border rounded-md px-3 py-1.5 hover:bg-ink-soft"
        >
          Zaposleni
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="w-full text-sm text-center whitespace-nowrap border border-border rounded-md px-3 py-1.5 hover:bg-ink-soft cursor-pointer"
          >
            Odjava
          </button>
        </form>
      </div>
    </>
  );
}

export default async function OwnerDashboard({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; month?: string; view?: string; week?: string }>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  // Meja izolacije med saloni: id salona SAMO tega prijavljenega uporabnika.
  // Vsaka poizvedba spodaj MORA filtrirati po salonId - to je edino, kar
  // (na nivoju aplikacije) prepreči mešanje podatkov med saloni; RLS
  // (my_salon_id() v shemi) je neodvisen, strežniški backstop za isto mejo.
  // getCachedOwnerRow (./cached-queries.ts) - prej sveža, nepredpomnjena
  // poizvedba ob VSAKEM obisku (izmerjeno kot del splošne počasnosti, glej
  // pogovor s Claude, celovita revizija zmogljivosti).
  const ownerRow = await getCachedOwnerRow(user.id);

  const salonTheme = resolveSalonTheme(ownerRow?.category);

  if (!ownerRow || ownerRow.status !== "approved") {
    return (
      <div
        data-theme={salonTheme}
        className="min-h-screen flex items-center justify-center bg-ink font-sans px-4"
      >
        <div className="w-full max-w-sm border border-border rounded-lg bg-panel p-6 space-y-4 text-center">
          <PoweredBy />
          <p className="text-sm text-cream">
            {!ownerRow
              ? "Tvoj račun ni povezan z nobenim salonom."
              : ownerRow.status === "rejected"
                ? "Tvoja registracija ni bila odobrena."
                : "Tvoj račun čaka na odobritev."}
          </p>
          <p className="text-xs text-cream-faint">
            {ownerRow ? `${ownerRow.salon_name} · ` : ""}
            {user.email}
          </p>
          <form action={logout}>
            <button
              type="submit"
              className="w-full rounded-md border border-border text-cream text-sm font-medium py-2 hover:bg-ink-soft cursor-pointer"
            >
              Odjava
            </button>
          </form>
        </div>
      </div>
    );
  }

  const salonId = ownerRow.id;
  const salonName = ownerRow.salon_name;
  // Za "Pošlji WhatsApp"/"Pošlji e-pošto" (glej WaitlistNotifyButton spodaj) -
  // povezava, kjer lahko čakajoča stranka takoj vidi proste termine in rezervira.
  const bookingUrl = `${PLATFORM_URL}/${ownerRow.slug}`;

  // Prej ločena, izolirana poizvedba (obramba pred migracijo, ki morda še ni
  // pognana v produkciji - glej git zgodovino) - neposredno preverjeno
  // (pogovor s Claude, celovita revizija zmogljivosti), da notification_preference
  // v produkciji ŽE obstaja, zato je zdaj del getCachedOwnerRow zgoraj, brez
  // dodatnega omrežnega klica.
  const notificationPreference = ownerRow.notification_preference ?? "off";

  const today = todayISO();
  const params = await searchParams;
  const selectedDate = params.date && DATE_RE.test(params.date) ? params.date : today;
  const monthStr =
    params.month && MONTH_RE.test(params.month) ? params.month : monthOf(selectedDate);
  // "week" pogled je izbiren dodatek k mesečnemu (glej pogovor s Claude) -
  // katerikoli neveljaven/manjkajoč "view" pade nazaj na obstoječe mesečno
  // vedenje, brez spremembe za nikogar, ki tega parametra ne pozna.
  const view = params.view === "week" ? "week" : "month";
  // weekStartOf normalizira NA PONEDELJEK, tudi če bi "?week=" kazal na
  // sredino tedna - URL vedno kaže na začetek tedna (glej week-calendar.tsx
  // navigacijske povezave, ki vedno pošljejo že normaliziran ponedeljek,
  // to tu je varovalka za ročno sestavljen/star URL).
  const weekStart =
    params.week && DATE_RE.test(params.week) ? weekStartOf(params.week) : weekStartOf(selectedDate);

  const isToday = selectedDate === today;
  const { start: monthStart, end: monthEnd } = monthRange(monthStr);

  const tomorrow = todayISO(1);
  const nextBizDay = nextAvailableDayAfterToday(ownerRow.hours);
  const isLiterallyTomorrow = nextBizDay === tomorrow;

  // Prej: 7 med seboj neodvisnih poizvedb (Promise.all - torej že vzporedno,
  // ne zaporedno), a VSE od njih so se znova izvedle ob VSAKEM kliku na
  // koledarju, tudi za mesec/dan, ki se ni spremenil (npr. klik na drug dan
  // ZNOTRAJ istega meseca je vseeno znova prebral cel mesec, čeprav se ta ni
  // spremenil - in obratno). getCachedMonthOverview/getCachedDayData/
  // getCachedTomorrowAppointments (./cached-queries.ts) to popravijo: vsak je
  // kratek čas predpomnjen PO (salonId, mesec/dan) - obisk ISTEGA meseca/dne
  // v tem oknu je torej brez nove poizvedbe na Supabase. Ob dejanski
  // spremembi (odpoved/dodan termin, ./actions.ts) se cache takoj invalidira.
  //
  // getCachedWeekData in "employees" sta ZDAJ TUDI v tej isti Promise.all
  // skupini - prej sta tekla ZAPOREDOMA ZA njo (in "employees" celo dvakrat,
  // ločeno, za isto tabelo), kar je bil izmerjen, dejanski vzrok počasnejšega
  // preklopa na tedenski pogled (glej pogovor s Claude - neposredna meritev
  // proti produkcijski bazi: ~500-700ms samo na nivoju baze). Nobena od teh
  // poizvedb ni odvisna od katere koli druge v tej skupini (vse potrebujejo
  // samo salonId, ki je že znan) - združitev v EN Promise.all je torej varna.
  // getCachedWeekData pri mesečnem pogledu ostane Promise.resolve(null) (brez
  // omrežnega klica) - isti "samo, če je dejansko izbran" princip kot prej.
  const weekDatesRange = weekDates(weekStart);
  const [monthOverview, dayData, tomorrowData, weekData, employeesResult] = await Promise.all([
    getCachedMonthOverview(salonId, monthStart, monthEnd),
    getCachedDayData(salonId, selectedDate),
    getCachedTomorrowAppointments(salonId, nextBizDay),
    view === "week"
      ? getCachedWeekData(salonId, weekDatesRange[0], weekDatesRange[6])
      : Promise.resolve(null),
    // getCachedEmployeesList (./cached-queries.ts) - deljena z
    // owner/employees/page.tsx (isti podatki, en cache namesto vsaka stran
    // svojo sveže poizvedbo). hasEmployees/employeeNameById spodaj iz VSEH
    // (tudi neaktivnih), activeEmployeesForWeek s filtrom active===true.
    getCachedEmployeesList(salonId),
  ]);
  const weekAppointments: WeekAppointment[] = (weekData?.appointments ?? []).map((a) => ({
    id: a.id,
    date: a.appointment_date,
    time: a.appointment_time,
    // Isti 60-min privzetek kot povsod drugod, dokler migracija morda ni
    // požena (glej pogovor s Claude, services.price incident).
    durationMinutes: a.duration_minutes ?? 60,
    customerName: a.customer_name,
    service: a.service,
    employeeId: a.employee_id,
    ownerNote: a.owner_note,
  }));

  const { appointments: monthAppointments, waitlist: monthWaitlist } = monthOverview;
  const {
    appointments,
    error,
    waitlist,
    waitlistError,
    waitlistTotal,
    smsLog,
    smsError,
    autoSmsLog,
  } = dayData;
  const { appointments: tomorrowAppointments, error: tomorrowError } = tomorrowData;

  const countsByDate: Record<string, number> = {};
  for (const a of monthAppointments) {
    countsByDate[a.appointment_date] = (countsByDate[a.appointment_date] ?? 0) + 1;
  }

  const waitingDates = new Set(monthWaitlist.map((w) => w.preferred_date));
  const waitlistExtra = Math.max(waitlistTotal - waitlist.length, 0);

  // Za gumb "Ponudi ta termin" pod ravno odpovedanim terminom: cancelAppointment
  // (./actions.ts) ob odpovedi za ujemajoče čakajoče stranke že USTVARI pending
  // sms_notifications vrstico (reason: "waitlist", appointment_id = odpovedani
  // termin) - tu jih samo grupiramo po terminu in razvrstimo po prioriteti
  // (prvi prijavljen na čakalno listo je prvi ponujen). Prioriteto beremo iz
  // `waitlist` (zanesljivo urejen po created_at), NE iz sms_notifications.created_at,
  // ker so bile vrstice vstavljene v enem batch insertu in bi lahko imele
  // enak timestamp.
  type SmsNotificationRow = (typeof smsLog)[number];

  const waitlistPriority = new Map((waitlist ?? []).map((w, i) => [w.customer_phone, i]));
  const waitlistOffersByAppointment = new Map<string, SmsNotificationRow[]>();
  for (const log of smsLog ?? []) {
    if (log.reason !== "waitlist" || !log.appointment_id) continue;
    const list = waitlistOffersByAppointment.get(log.appointment_id) ?? [];
    list.push(log);
    waitlistOffersByAppointment.set(log.appointment_id, list);
  }
  for (const list of waitlistOffersByAppointment.values()) {
    list.sort(
      (a, b) =>
        (waitlistPriority.get(a.recipient_phone) ?? Infinity) -
        (waitlistPriority.get(b.recipient_phone) ?? Infinity)
    );
  }

  // VSI zaposleni (tudi deaktivirani, glej groupByEmployee spodaj), za
  // ime/skupinjenje - ne za odločanje "ali naj se pokaže izbirnik" (to je
  // ločena, aktivnost-scopana logika v manual-booking-form.tsx in
  // booking-page.tsx). Skupinjenje se sploh ne prikaže, če salon NIKOLI ni
  // dodal nobenega zaposlenega (identično vedenje kot pred to funkcionalnostjo).
  const employees = employeesResult.employees;
  const hasEmployees = employees.length > 0;
  const employeeNameById = new Map(employees.map((e) => [e.id, e.name]));
  const appointmentGroups = hasEmployees ? groupByEmployee(appointments, employeeNameById) : null;
  const tomorrowGroups = hasEmployees
    ? groupByEmployee(tomorrowAppointments, employeeNameById)
    : null;

  // SAMO aktivni - za week-calendar.tsx (razpon ur + barvna legenda).
  // Neaktiven zaposlen ne sme podaljšati prikazanega urnega razpona niti
  // dobiti svoje barve v legendi. Vrstni red (sort_order) je že iz zgornje
  // poizvedbe - filter ohrani relativni vrstni red.
  const activeEmployeesForWeek = view === "week" ? employees.filter((e) => e.active) : [];

  return (
    // data-design="v2" - preskusna "premium prenova" (glej pogovor s Claude,
    // sence/zaobljenost/razmik/pisava/barve), NAMENOMA samo na tem EDINEM
    // zaslonu, dokler lastnik ne potrdi - glej [data-design="v2"] v
    // globals.css za celoten obseg.
    <div
      data-theme={salonTheme}
      data-design="v2"
      className="min-h-screen bg-ink text-cream font-sans px-6 py-10"
    >
      <OwnerAutoRefresh />
      {/* Logotip NAMENOMA izven max-w-2xl stolpca spodaj (ne znotraj) - tako
          je poravnan na LEVI ROB CELE STRANI (px-6 zgornjega ovojnika), ne na
          rob centriranega stolpca, ki je na širokih zaslonih sam vizualno
          "na sredini" (glej pogovor s Claude - "trenutna pozicija, centriran"). */}
      <div className="mb-6">
        <PoweredBy size="lg" />
      </div>
      <div className="max-w-2xl mx-auto">
        {/* relative SAMO na tem info bloku (ne na celi strani) - sidro za
            absolutno pozicioniran stranski stolpec spodaj (xl+), da ta NI
            del normalnega toka in torej ne vpliva na višino/scroll ostanka
            strani (paneli spodaj), ne glede na to, kako visok je sam
            (preklop + 4 gumbi) - glej pogovor s Claude, "raztegne stran". */}
        <div className="mb-8 relative">
          <div>
            {/* fraunces.className NAMESTO font-display (Tailwind razred, ki
                bi tu prebral --font-fraunces - ta je znotraj [data-design=
                "v2"] prepisan na Manrope, glej globals.css) - lastnik je
                želel bolj "premium" ime salona (glej pogovor s Claude),
                pravi elegantni serif Fraunces (namesto splošne UI pisave)
                izstopa SAMO tu, kjer je to namenoma, ostala postavitev
                ostane pri Manrope. */}
            <p className={`${fraunces.className} text-5xl font-semibold tracking-tight text-gold mb-2`}>
              {salonName}
            </p>
            <h1 className="text-sm font-medium text-cream-dim">Nadzorna plošča</h1>
            <p className="text-sm text-cream-faint">{user.email}</p>
          </div>

          {/* Pod xl - stranski stolpec (glej spodaj) fizično nima prostora v
              robu, zato tu sklad V TOKU, pod info blokom. */}
          <div className="xl:hidden mt-4 flex flex-col items-end gap-2">
            <OwnerHeaderControls salonTheme={salonTheme} />
          </div>

          {/* xl+ - absolutno pozicioniran, TAKOJ ZA desnim robom te
              (max-w-2xl) glave (left-full) + majhna vrzel (ml-6), navpično
              centriran na info blok (top-1/2 -translate-y-1/2). Prostor za
              to obstaja samo na dovolj širokih zaslonih - preverjeno
              empirično, da se ne prekriva/prilepi na vsebino. */}
          <div className="hidden xl:flex absolute top-1/2 -translate-y-1/2 left-full ml-6 flex-col items-stretch gap-2">
            <OwnerHeaderControls salonTheme={salonTheme} />
          </div>
        </div>

        <LogoUpload initialLogoUrl={ownerRow.logo_url} />

        <NotificationSettings current={notificationPreference} />
      </div>

      {/* Koledarski razdelek NAMENOMA izven max-w-2xl (širši max-w-5xl) - pri
          672px je bilo pri tedenskem/dnevnem pogledu premalo prostora za
          daljša imena storitev ("Britje z britvico" ipd.), besedilo se je
          odrezovalo (glej pogovor s Claude). Preostanek strani (spodaj) ostane
          pri max-w-2xl - besedilne sekcije (čakalna lista/seznami terminov)
          berejo bolje pri ožji širini, koledar pa potrebuje več prostora. */}
      <div className="max-w-5xl mx-auto">
        {/* Preklop mesečni/tedenski pogled - čist URL (?view=), brez client
            JS-a, isti vzorec kot vsa ostala koledarska navigacija na tej
            strani (glej pogovor s Claude - tedenski pogled je DODATNA
            možnost, "month" ostane privzet, da se za obstoječe uporabnike/
            zaznamke ne spremeni ničesar). */}
        <div className="inline-flex gap-1 bg-ink-soft p-1 rounded-md mb-3">
          <Link
            href={`/owner?date=${selectedDate}&month=${monthStr}`}
            scroll={false}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              view === "month" ? "bg-burgundy text-on-accent" : "text-cream-dim hover:text-cream"
            }`}
          >
            Mesečni pregled
          </Link>
          <Link
            href={`/owner?date=${selectedDate}&view=week&week=${weekStart}`}
            scroll={false}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              view === "week" ? "bg-burgundy text-on-accent" : "text-cream-dim hover:text-cream"
            }`}
          >
            Tedenski pogled
          </Link>
        </div>

        {/* CalendarBookingProvider - omogoča klik na prosto uro v tedenskem/
            dnevnem pogledu (glej clickable-day-column.tsx), da odpre
            ManualBookingForm kot modal, predizpolnjen z datumom/uro/
            zaposlenim (glej pogovor s Claude). MonthCalendar te
            funkcionalnosti ne uporablja (brez urne mreže), a je neškodljivo
            zajet v isti ovojnik. */}
        <CalendarBookingProvider salonId={salonId} salonHours={ownerRow.hours}>
          {view === "week" ? (
            <WeekCalendar
              weekStart={weekStart}
              selectedDate={selectedDate}
              today={today}
              appointments={weekAppointments}
              employees={activeEmployeesForWeek}
              salonHours={ownerRow.hours}
            />
          ) : (
            <MonthCalendar
              monthStr={monthStr}
              selectedDate={selectedDate}
              today={today}
              countsByDate={countsByDate}
              waitingDates={waitingDates}
              salonHours={ownerRow.hours}
            />
          )}
        </CalendarBookingProvider>
      </div>

      <div className="max-w-2xl mx-auto">
        {waitlistError ? (
          <p className="text-sm text-rose mb-10">
            Napaka pri branju obvestil o prostem terminu: {waitlistError}
          </p>
        ) : (
          <div className="mb-10 rounded-lg border border-gold/40 bg-gradient-to-br from-ink-elevated to-ink p-5">
            <div className="flex items-center gap-2 mb-1">
              <Users size={18} className="text-gold" />
              <span className="font-display text-lg text-cream">
                Obvestila o prostem terminu
              </span>
              {waitlistTotal && waitlistTotal > 0 && (
                <span className="text-sm text-cream-faint">({waitlistTotal})</span>
              )}
            </div>
            <p className="text-xs text-cream-faint mb-2 capitalize">
              {dayLabel(selectedDate)}
              {isToday && " · danes"}
            </p>

            {!waitlist || waitlist.length === 0 ? (
              <p className="text-sm text-cream-muted">
                Trenutno ni nikogar naročenega na obvestila. Ko bodo vsi
                termini zasedeni, se bodo tukaj prikazale stranke, ki so se
                naročile na obvestilo o prostem terminu.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-border-soft">
                {waitlist.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="text-cream">{w.customer_name}</span>
                      <span className="text-cream-faint ml-2">
                        {w.customer_phone}
                      </span>
                      <div className="text-gold text-xs mt-0.5">
                        {w.service_preference === "vseeno"
                          ? "Vseeno katera storitev"
                          : w.service_preference}
                      </div>
                      {hasEmployees && (
                        <div className="text-cream-faint text-xs mt-0.5">
                          {w.employee_id
                            ? (employeeNameById.get(w.employee_id) ?? "Neznan zaposleni")
                            : "Vseeno kdo"}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0">
                      <WaitlistNotifyButton
                        entry={w}
                        bookingUrl={bookingUrl}
                        employeeName={w.employee_id ? (employeeNameById.get(w.employee_id) ?? null) : null}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {waitlistExtra > 0 && (
              <p className="mt-2 text-xs text-cream-faint">
                +{waitlistExtra} dodatnih naročenih na obvestila
              </p>
            )}
          </div>
        )}

        <AppointmentsHeader
          title={`Termini za ${isToday ? "danes" : dayLabel(selectedDate)}`}
          initialDate={selectedDate}
          salonId={salonId}
          salonHours={ownerRow.hours}
        />
        <div className="border border-border rounded-lg bg-panel divide-y divide-border-soft mb-10">
          {error && (
            <p className="p-4 text-sm text-rose">
              Napaka pri branju terminov: {error}
            </p>
          )}
          {!error && appointments?.length === 0 && (
            <p className="p-4 text-sm text-cream-dim">Ni terminov za ta dan.</p>
          )}
          {(() => {
            function renderAppointment(a: (typeof appointments)[number]) {
              const waitlistOffers =
                a.status === "cancelled" ? waitlistOffersByAppointment.get(a.id) : undefined;
              return (
                <div key={a.id}>
                  {/* min-w-0 na besedilu + shrink-0 na gumbu - brez tega bi
                      dolgo ime/priimek + storitev (glej pogovor s Claude)
                      lahko potisnilo/prekrilo gumb "Odpovej", namesto da se
                      besedilo prelomi v naslednjo vrstico. */}
                  <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <span className="text-gold font-medium mr-3">
                        {a.appointment_time}
                      </span>
                      <span
                        className={
                          a.status === "cancelled"
                            ? "line-through text-cream-ghost"
                            : "text-cream"
                        }
                      >
                        {a.customer_name}
                      </span>
                      {a.status === "filled" && (
                        <span className="text-sage text-xs ml-2">(zapolnjeno)</span>
                      )}
                      <span className="text-cream-faint"> — {a.service}</span>
                    </div>
                    {a.status === "booked" && (
                      <form action={cancelAppointment.bind(null, a.id)} className="shrink-0">
                        <button
                          type="submit"
                          className="text-xs px-3 py-1.5 rounded border border-rose text-rose hover:bg-rose/10 cursor-pointer whitespace-nowrap"
                        >
                          Odpovej
                        </button>
                      </form>
                    )}
                  </div>
                  {waitlistOffers && waitlistOffers.length > 0 && (
                    <WaitlistOffer offers={waitlistOffers} />
                  )}
                </div>
              );
            }

            // Skupinjeno po zaposlenem (glej groupByEmployee zgoraj) SAMO,
            // če je salon kadarkoli dodal vsaj enega zaposlenega - sicer
            // enak ploščat seznam kot pred to funkcionalnostjo. Fragment
            // (ne wrapper div) ohrani glave skupin in termine kot NEPOSREDNE
            // otroke zgornjega "divide-y" vsebnika, da ločilne črte ostanejo
            // med VSAKO vrstico, ne le med skupinami.
            return appointmentGroups
              ? appointmentGroups.map((group) => (
                  <Fragment key={group.employeeId ?? "__none__"}>
                    <p className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-gold">
                      {group.employeeName}
                    </p>
                    {group.items.map(renderAppointment)}
                  </Fragment>
                ))
              : appointments?.map(renderAppointment);
          })()}
        </div>

        <h2 className="text-lg font-medium mb-1 flex items-center gap-2">
          <Clock size={18} className="text-gold" />
          {isLiterallyTomorrow ? "Termini za jutri" : `Termini za ${dayLabel(nextBizDay)}`}
        </h2>
        <p className="text-xs text-cream-faint mb-3 capitalize">{dayLabel(nextBizDay)}</p>
        <div className="border border-border rounded-lg bg-panel divide-y divide-border-soft mb-10">
          {tomorrowError && (
            <p className="p-4 text-sm text-rose">
              Napaka pri branju terminov: {tomorrowError}
            </p>
          )}
          {!tomorrowError && tomorrowAppointments?.length === 0 && (
            <p className="p-4 text-sm text-cream-dim">Ni terminov za ta dan.</p>
          )}
          {(() => {
            function renderTomorrowAppointment(a: (typeof tomorrowAppointments)[number]) {
              const intro = isLiterallyTomorrow ? "jutri" : dayLabel(nextBizDay);
              const employeeLine = a.employee_id
                ? ` pri ${employeeNameById.get(a.employee_id) ?? "izvajalcu"}`
                : "";
              const reminderMessage =
                `Opomnik: ${intro} ob ${a.appointment_time} imaš rezervacijo za ${a.service}${employeeLine} - ${salonName}. Se vidimo! ` +
                `Upravljaj svojo rezervacijo: ${bookingManageUrl(a.token)}`;
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <span className="text-gold font-medium mr-3">
                      {a.appointment_time}
                    </span>
                    <span className="text-cream">{a.customer_name}</span>
                    <span className="text-cream-faint"> — {a.service}</span>
                  </div>
                  <a
                    href={whatsAppLink(a.customer_phone, reminderMessage)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 whitespace-nowrap flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-sage text-sage hover:bg-sage/10"
                  >
                    <MessageCircle size={13} /> Pošlji opomnik
                  </a>
                </div>
              );
            }

            return tomorrowGroups
              ? tomorrowGroups.map((group) => (
                  <Fragment key={group.employeeId ?? "__none__"}>
                    <p className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-gold">
                      {group.employeeName}
                    </p>
                    {group.items.map(renderTomorrowAppointment)}
                  </Fragment>
                ))
              : tomorrowAppointments?.map(renderTomorrowAppointment);
          })()}
        </div>

        {smsError ? (
          <p className="text-sm text-rose">
            Napaka pri branju obvestil: {smsError}
          </p>
        ) : (
          <NotificationsPanel
            smsLog={smsLog ?? []}
            autoSmsLog={autoSmsLog ?? []}
            plan={ownerRow.plan}
            selectedDate={selectedDate}
            isToday={isToday}
          />
        )}
      </div>
    </div>
  );
}
