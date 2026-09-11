import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cancelAppointment, claimFromLog, logout } from "./actions";
import { SHOP_NAME, todayISO } from "@/lib/constants";

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

        <h2 className="text-lg font-medium mb-3">Termini za danes</h2>
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

        <h2 className="text-lg font-medium mb-1 flex items-center gap-2">
          <Bell size={18} className="text-gold" /> Poslana SMS obvestila
        </h2>
        <p className="text-xs text-cream-faint mb-3">
          Simulacija — v resnični postavitvi gredo prek SMS ponudnika (npr.
          Twilio).
        </p>
        <div className="border border-border rounded-lg divide-y divide-border-soft">
          {smsError && (
            <p className="p-4 text-sm text-rose">
              Napaka pri branju obvestil: {smsError.message}
            </p>
          )}
          {!smsError && smsLog?.length === 0 && (
            <p className="p-4 text-sm text-cream-dim">
              Ni aktivnih obvestil. Odpovej termin, da vidiš, kako sistem
              reagira.
            </p>
          )}
          {smsLog?.map((log) => (
            <div
              key={log.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium">
                  {log.recipient_name}{" "}
                  <span className="text-xs text-gold ml-1.5">
                    {log.reason === "pattern_match"
                      ? "AI zazna vzorec"
                      : "čakalna vrsta"}
                  </span>
                </div>
                <div className="text-xs text-cream-faint mt-0.5">
                  {log.message}
                </div>
              </div>
              <form action={claimFromLog.bind(null, log.id)}>
                <button
                  type="submit"
                  className="whitespace-nowrap text-xs px-3 py-1.5 rounded border border-sage text-sage hover:bg-sage/10 cursor-pointer"
                >
                  Potrdi
                </button>
              </form>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
