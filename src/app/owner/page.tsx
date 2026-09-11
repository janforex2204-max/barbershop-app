import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cancelAppointment, logout } from "./actions";
import { SHOP_NAME, todayISO, dayLabel, monthOf, monthRange } from "@/lib/constants";
import ManualBookingForm from "./manual-booking-form";
import NotificationsPanel from "./notifications-panel";
import MonthCalendar from "./month-calendar";

function waitlistCountLabel(n: number) {
  if (n === 1) return "1 stranka čaka na termin";
  if (n === 2) return "2 stranki čakata na termin";
  if (n === 3 || n === 4) return `${n} stranke čakajo na termin`;
  return `${n} strank čaka na termin`;
}

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

  const { data: waitlist, error: waitlistError } = await supabase
    .from("waitlist")
    .select("*")
    .eq("preferred_date", selectedDate)
    .order("created_at", { ascending: true });

  const { data: smsLog, error: smsError } = await supabase
    .from("sms_notifications")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  return (
    <div className="min-h-screen bg-ink text-cream font-sans px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="font-display text-lg text-gold mb-1">{SHOP_NAME}</p>
            <h1 className="text-2xl font-semibold">Nadzorna plošča</h1>
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
                {waitlist && waitlist.length > 0
                  ? waitlistCountLabel(waitlist.length)
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
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium capitalize">
            Termini za {isToday ? "danes" : dayLabel(selectedDate)}
          </h2>
          <ManualBookingForm initialDate={selectedDate} />
        </div>
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

        {smsError ? (
          <p className="text-sm text-rose">
            Napaka pri branju obvestil: {smsError.message}
          </p>
        ) : (
          <NotificationsPanel smsLog={smsLog ?? []} />
        )}
      </div>
    </div>
  );
}
