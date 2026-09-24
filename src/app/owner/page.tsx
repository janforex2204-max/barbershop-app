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
  nextBusinessDayAfterToday,
  whatsAppLink,
  bookingManageUrl,
  resolveSalonTheme,
  PLATFORM_URL,
} from "@/lib/constants";
import AppointmentsHeader from "./appointments-header";
import NotificationsPanel from "./notifications-panel";
import NotificationSettings from "./notification-settings";
import MonthCalendar from "./month-calendar";
import WaitlistOffer from "./waitlist-offer";
import WaitlistNotifyButton from "./waitlist-notify-button";
import LogoUpload from "./logo-upload";
import PoweredBy from "@/components/powered-by";
import ThemeToggle from "@/components/theme-toggle";
import {
  getCachedDayData,
  getCachedMonthOverview,
  getCachedTomorrowAppointments,
} from "./cached-queries";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

export default async function OwnerDashboard({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; month?: string }>;
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
  const { data: ownerRow } = await supabase
    .from("salon_owners")
    .select("id, salon_name, slug, status, plan, hours, category, logo_url")
    .eq("user_id", user.id)
    .maybeSingle();

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

  // Ločena, izolirana poizvedba - dokler migracija (supabase/schema.sql) za
  // notification_preference morda še ni pognana v produkciji, ta stolpec
  // morda ne obstaja. Če pade, privzeto "off" namesto da podre CELO
  // nadzorno ploščo (isti nauk kot pri services.price prej - glej
  // [slug]/booking-page.tsx).
  const { data: notificationRow } = await supabase
    .from("salon_owners")
    .select("notification_preference")
    .eq("id", salonId)
    .maybeSingle();
  const notificationPreference = notificationRow?.notification_preference ?? "off";

  const today = todayISO();
  const params = await searchParams;
  const selectedDate = params.date && DATE_RE.test(params.date) ? params.date : today;
  const monthStr =
    params.month && MONTH_RE.test(params.month) ? params.month : monthOf(selectedDate);

  const isToday = selectedDate === today;
  const { start: monthStart, end: monthEnd } = monthRange(monthStr);

  const tomorrow = todayISO(1);
  const nextBizDay = nextBusinessDayAfterToday();
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
  const [monthOverview, dayData, tomorrowData] = await Promise.all([
    getCachedMonthOverview(salonId, monthStart, monthEnd),
    getCachedDayData(salonId, selectedDate),
    getCachedTomorrowAppointments(salonId, nextBizDay),
  ]);

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

  return (
    <div data-theme={salonTheme} className="min-h-screen bg-ink text-cream font-sans px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <PoweredBy size="lg" />
          {/* Glej isto opombo v [slug]/booking-page.tsx - preklop nima
              učinka, ko je tema salona vsiljena prek data-theme zgoraj. */}
          {!salonTheme && <ThemeToggle />}
        </div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="font-display text-3xl text-gold mb-1">{salonName}</p>
            <h1 className="text-sm font-medium text-cream-dim">Nadzorna plošča</h1>
            <p className="text-sm text-cream-faint">{user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/owner/services"
              className="text-sm border border-border rounded-md px-3 py-1.5 hover:bg-ink-soft"
            >
              Storitve in cenik
            </Link>
            <Link
              href="/owner/hours"
              className="text-sm border border-border rounded-md px-3 py-1.5 hover:bg-ink-soft"
            >
              Delovni čas
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="text-sm border border-border rounded-md px-3 py-1.5 hover:bg-ink-soft cursor-pointer"
              >
                Odjava
              </button>
            </form>
          </div>
        </div>

        <LogoUpload salonId={salonId} initialLogoUrl={ownerRow.logo_url} />

        <NotificationSettings current={notificationPreference} plan={ownerRow.plan} />

        <MonthCalendar
          monthStr={monthStr}
          selectedDate={selectedDate}
          today={today}
          countsByDate={countsByDate}
          waitingDates={waitingDates}
        />

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
                    <div>
                      <span className="text-cream">{w.customer_name}</span>
                      <span className="text-cream-faint ml-2">
                        {w.customer_phone}
                      </span>
                      <div className="text-gold text-xs mt-0.5">
                        {w.service_preference === "vseeno"
                          ? "Vseeno katera storitev"
                          : w.service_preference}
                      </div>
                    </div>
                    <WaitlistNotifyButton entry={w} bookingUrl={bookingUrl} />
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
          {appointments?.map((a) => {
            const waitlistOffers =
              a.status === "cancelled" ? waitlistOffersByAppointment.get(a.id) : undefined;
            return (
              <div key={a.id}>
                <div className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
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
                    <form action={cancelAppointment.bind(null, a.id)}>
                      <button
                        type="submit"
                        className="text-xs px-3 py-1.5 rounded border border-rose text-rose hover:bg-rose/10 cursor-pointer"
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
          })}
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
          {tomorrowAppointments?.map((a) => {
            const intro = isLiterallyTomorrow ? "jutri" : dayLabel(nextBizDay);
            const reminderMessage =
              `Opomnik: ${intro} ob ${a.appointment_time} imaš rezervacijo za ${a.service} - ${salonName}. Se vidimo! ` +
              `Upravljaj svojo rezervacijo: ${bookingManageUrl(a.token)}`;
            return (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
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
                  className="whitespace-nowrap flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-sage text-sage hover:bg-sage/10"
                >
                  <MessageCircle size={13} /> Pošlji opomnik
                </a>
              </div>
            );
          })}
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
