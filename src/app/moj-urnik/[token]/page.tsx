import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayISO, dayLabel, resolveSalonTheme } from "@/lib/constants";
import PoweredBy from "@/components/powered-by";
import ThemeToggle from "@/components/theme-toggle";

// manifest.webmanifest/route.ts (isti direktorij) generira PWA manifest,
// oseben za TA token (ime, start_url) - manifest.(json|ts) posebna
// datotečna konvencija Next.js podpira SAMO v korenu app/, ne v gnezdenih
// dinamičnih segmentih (preverjeno v Next dokumentaciji), zato navaden
// Route Handler + ročna povezava tu namesto konvencije.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  return {
    title: "Moj urnik",
    manifest: `/moj-urnik/${token}/manifest.webmanifest`,
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Moj urnik" },
  };
}

// Token JE avtorizacija (isti vzorec/utemeljitev kot /rezervacija/[token],
// glej tisto page.tsx) - admin klient, mimo RLS, BREZ prijave. Prikaže
// SAMO ime zaposlenega + njegove prihodnje termine (čas/stranka/storitev) -
// namerno BREZ česarkoli drugega (nastavitve salona, cene, drugi
// zaposleni) - to ni nadzorna plošča, samo oseben, deljiv "moj urnik".
export default async function MojUrnikPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: employee } = await admin
    .from("employees")
    .select("id, name, salon_id")
    .eq("schedule_token", token)
    .maybeSingle();

  if (!employee) {
    notFound();
  }

  const { data: salon } = await admin
    .from("salon_owners")
    .select("salon_name, category")
    .eq("id", employee.salon_id)
    .maybeSingle();

  if (!salon) {
    notFound();
  }

  const salonTheme = resolveSalonTheme(salon.category);
  const today = todayISO();

  const { data: appointments } = await admin
    .from("appointments")
    .select("appointment_date, appointment_time, customer_name, service")
    .eq("employee_id", employee.id)
    .gte("appointment_date", today)
    .neq("status", "cancelled")
    .order("appointment_date", { ascending: true })
    .order("appointment_time", { ascending: true });

  // Skupinjeno po datumu, v vrstnem redu PRVEGA pojava (poizvedba zgoraj je
  // že urejena po datumu/uri, zato je to samo "razdeli na predale", ne
  // dodatno razvrščanje) - isti bucket-po-ključu vzorec kot groupByEmployee
  // v owner/page.tsx.
  const order: string[] = [];
  const byDate = new Map<string, NonNullable<typeof appointments>>();
  for (const appt of appointments ?? []) {
    if (!byDate.has(appt.appointment_date)) {
      order.push(appt.appointment_date);
      byDate.set(appt.appointment_date, []);
    }
    byDate.get(appt.appointment_date)!.push(appt);
  }

  return (
    <div data-theme={salonTheme} className="min-h-screen bg-ink text-cream font-sans px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <PoweredBy size="lg" />
          {!salonTheme && (
            <ThemeToggle size={20} className="border border-border bg-ink-field p-2" />
          )}
        </div>

        <div className="mb-8">
          <p className="font-display text-3xl text-gold mb-1">{employee.name}</p>
          <h1 className="text-sm font-medium text-cream-dim">Tvoj urnik pri {salon.salon_name}</h1>
        </div>

        {order.length === 0 ? (
          <p className="text-sm text-cream-faint">Trenutno nimaš prihodnjih terminov.</p>
        ) : (
          <div className="space-y-6">
            {order.map((date) => (
              <div key={date}>
                <p className="text-xs font-bold uppercase tracking-wide text-gold mb-2 capitalize">
                  {dayLabel(date)}
                </p>
                <div className="border border-border rounded-lg bg-panel divide-y divide-border-soft">
                  {byDate.get(date)!.map((appt, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                    >
                      <span className="text-gold font-medium shrink-0">{appt.appointment_time}</span>
                      <span className="flex-1 text-cream truncate">{appt.customer_name}</span>
                      <span className="text-xs text-cream-faint text-right">{appt.service}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
