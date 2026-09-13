import { Clock, MessageCircle, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cancelAppointment, logout } from "./actions";
import {
  SHOP_NAME,
  PLATFORM_NAME,
  todayISO,
  dayLabel,
  monthOf,
  monthRange,
  nextBusinessDayAfterToday,
  whatsAppLink,
} from "@/lib/constants";
import AppointmentsHeader from "./appointments-header";
import NotificationsPanel from "./notifications-panel";
import MonthCalendar from "./month-calendar";

function waitlistCountLabel(n: number) {
  if (n === 1) return "1 stranka čaka na termin";
  if (n === 2) return "2 stranki čakata na termin";
  if (n === 3 || n === 4) return `${n} stranke čakajo na termin`;
  return `${n} strank čaka na termin`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WAITLIST_LIMIT = 50;
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

  // Odobritev lastnika: manjkajoča vrstica (star/ročno ustvarjen račun) se
  // šteje kot odobrena, da se z uvedbo te tabele ne zaklene obstoječi dostop -
  // zavrnjen je samo, če vrstica OBSTAJA in status ni "approved".
  if (user) {
    const { data: ownerRow } = await supabase
      .from("salon_owners")
      .select("status, salon_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (ownerRow && ownerRow.status !== "approved") {
      return (
        <div className="min-h-screen flex items-center justify-center bg-ink font-sans px-4">
          <div className="w-full max-w-sm border border-border rounded-lg p-6 space-y-4 text-center">
            <p className="font-display text-lg text-gold">{PLATFORM_NAME}</p>
            <p className="text-sm text-cream">
              {ownerRow.status === "rejected"
                ? "Tvoja registracija ni bila odobrena."
                : "Tvoj račun čaka na odobritev."}
            </p>
            <p className="text-xs text-cream-faint">
              {ownerRow.salon_name} · {user.email}
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
  }

  const today = todayISO();
  const params = await searchParams;
  const selectedDate = params.date && DATE_RE.test(params.date) ? params.date : today;
  const monthStr =
    params.month && MONTH_RE.test(params.month) ? params.month : monthOf(selectedDate);

  const isToday = selectedDate === today;
  const { start: monthStart, end: monthEnd } = monthRange(monthStr);

  const { data: monthAppointments } = await supabase
    .from("appointments")
    .select("appointment_date")
    .gte("appointment_date", monthStart)
    .lte("appointment_date", monthEnd)
    .neq("status", "cancelled");

  const countsByDate: Record<string, number> = {};
  for (const a of monthAppointments ?? []) {
    countsByDate[a.appointment_date] = (countsByDate[a.appointment_date] ?? 0) + 1;
  }

  const { data: monthWaitlist } = await supabase
    .from("waitlist")
    .select("preferred_date")
    .gte("preferred_date", monthStart)
    .lte("preferred_date", monthEnd);

  const waitingDates = new Set((monthWaitlist ?? []).map((w) => w.preferred_date));

  const { data: appointments, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("appointment_date", selectedDate)
    .order("appointment_time", { ascending: true });

  const {
    data: waitlist,
    error: waitlistError,
    count: waitlistTotal,
  } = await supabase
    .from("waitlist")
    .select("*", { count: "exact" })
    .eq("preferred_date", selectedDate)
    .order("created_at", { ascending: true })
    .limit(WAITLIST_LIMIT);

  const waitlistExtra = Math.max((waitlistTotal ?? 0) - (waitlist?.length ?? 0), 0);

  const tomorrow = todayISO(1);
  const nextBizDay = nextBusinessDayAfterToday();
  const isLiterallyTomorrow = nextBizDay === tomorrow;

  const { data: tomorrowAppointments, error: tomorrowError } = await supabase
    .from("appointments")
    .select("*")
    .eq("appointment_date", nextBizDay)
    .neq("status", "cancelled")
    .order("appointment_time", { ascending: true });

  const { data: smsLog, error: smsError } = await supabase
    .from("sms_notifications")
    .select("*")
    .eq("status", "pending")
    .eq("appointment_date", selectedDate)
    .order("created_at", { ascending: true });

  return (
    <div className="min-h-screen bg-ink text-cream font-sans px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="font-display text-3xl text-gold mb-1">{SHOP_NAME}</p>
            <h1 className="text-sm font-medium text-cream-dim">Nadzorna plošča</h1>
            <p className="text-sm text-cream-faint">{user?.email}</p>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="text-sm border border-border rounded-md px-3 py-1.5 hover:bg-ink-soft cursor-pointer"
            >
              Odjava
            </button>
          </form>
        </div>

        <MonthCalendar
          monthStr={monthStr}
          selectedDate={selectedDate}
          today={today}
          countsByDate={countsByDate}
          waitingDates={waitingDates}
        />

        {waitlistError ? (
          <p className="text-sm text-rose mb-10">
            Napaka pri branju čakajočih: {waitlistError.message}
          </p>
        ) : (
          <div className="mb-10 rounded-lg border border-gold/40 bg-gradient-to-br from-[#2E2620] to-[#1B1815] p-5">
            <div className="flex items-center gap-2 mb-1">
              <Users size={18} className="text-gold" />
              <span className="font-display text-lg text-cream">
                {waitlistTotal && waitlistTotal > 0
                  ? waitlistCountLabel(waitlistTotal)
                  : "Čakajo na termin"}
              </span>
            </div>
            <p className="text-xs text-cream-faint mb-2 capitalize">
              {dayLabel(selectedDate)}
              {isToday && " · danes"}
            </p>

            {!waitlist || waitlist.length === 0 ? (
              <p className="text-sm text-cream-muted">
                Trenutno ni čakajočih - ko bo salon poln, se bodo stranke lahko
                prijavile tukaj.
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
                    </div>
                    <div className="text-gold text-xs">
                      {w.service_preference === "vseeno"
                        ? "Vseeno katera storitev"
                        : w.service_preference}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {waitlistExtra > 0 && (
              <p className="mt-2 text-xs text-cream-faint">
                +{waitlistExtra} dodatnih čaka
              </p>
            )}
          </div>
        )}

        <AppointmentsHeader
          title={`Termini za ${isToday ? "danes" : dayLabel(selectedDate)}`}
          initialDate={selectedDate}
        />
        <div className="border border-border rounded-lg divide-y divide-border-soft mb-10">
          {error && (
            <p className="p-4 text-sm text-rose">
              Napaka pri branju terminov: {error.message}
            </p>
          )}
          {!error && appointments?.length === 0 && (
            <p className="p-4 text-sm text-cream-dim">Ni terminov za ta dan.</p>
          )}
          {appointments?.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between px-4 py-3 text-sm"
            >
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
          ))}
        </div>

        <h2 className="text-lg font-medium mb-1 flex items-center gap-2">
          <Clock size={18} className="text-gold" />
          {isLiterallyTomorrow ? "Termini za jutri" : `Termini za ${dayLabel(nextBizDay)}`}
        </h2>
        <p className="text-xs text-cream-faint mb-3 capitalize">{dayLabel(nextBizDay)}</p>
        <div className="border border-border rounded-lg divide-y divide-border-soft mb-10">
          {tomorrowError && (
            <p className="p-4 text-sm text-rose">
              Napaka pri branju terminov: {tomorrowError.message}
            </p>
          )}
          {!tomorrowError && tomorrowAppointments?.length === 0 && (
            <p className="p-4 text-sm text-cream-dim">Ni terminov za ta dan.</p>
          )}
          {tomorrowAppointments?.map((a) => {
            const intro = isLiterallyTomorrow ? "jutri" : dayLabel(nextBizDay);
            const reminderMessage = `Opomnik: ${intro} ob ${a.appointment_time} imaš rezervacijo za ${a.service} - ${SHOP_NAME}. Se vidimo!`;
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
            Napaka pri branju obvestil: {smsError.message}
          </p>
        ) : (
          <NotificationsPanel
            smsLog={smsLog ?? []}
            selectedDate={selectedDate}
            isToday={isToday}
          />
        )}
      </div>
    </div>
  );
}
