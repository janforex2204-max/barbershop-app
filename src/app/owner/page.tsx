import { createClient } from "@/lib/supabase/server";
import { cancelAppointment, logout } from "./actions";
import { SHOP_NAME, todayISO } from "@/lib/constants";
import ManualBookingForm from "./manual-booking-form";
import NotificationsPanel from "./notifications-panel";

export default async function OwnerDashboard() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const today = todayISO();

  const { data: appointments, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("appointment_date", today)
    .order("appointment_time", { ascending: true });

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

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Termini za danes</h2>
          <ManualBookingForm />
        </div>
        <div className="border border-border rounded-lg divide-y divide-border-soft mb-10">
          {error && (
            <p className="p-4 text-sm text-rose">
              Napaka pri branju terminov: {error.message}
            </p>
          )}
          {!error && appointments?.length === 0 && (
            <p className="p-4 text-sm text-cream-dim">Ni terminov za danes.</p>
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
