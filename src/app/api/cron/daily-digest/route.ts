import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dayLabel, todayISO } from "@/lib/constants";
import { sendDailyDigest } from "@/lib/email";

// Vercel Cron pokliče to pot enkrat dnevno (glej vercel.json "crons" in
// razlago v pogovoru s Claude, kaj je treba nastaviti na Vercel strani).
// Vercel VSAKI cron zahtevi samodejno doda `Authorization: Bearer
// <CRON_SECRET>` glavo - CRON_SECRET moraš sam dodati v Vercel Project
// Settings -> Environment Variables. Brez ujemajočega CRON_SECRET zahtevo
// zavrnemo - sicer bi lahko KDORKOLI, ki pozna to pot, sprožil pošiljanje
// emailov vsem lastnikom na 'daily' povzetku.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = todayISO();

  const { data: salons, error } = await admin
    .from("salon_owners")
    .select("id, salon_name, user_id")
    .eq("status", "approved")
    .eq("plan", "pro")
    .eq("notification_preference", "daily");

  if (error) {
    console.error("[cron/daily-digest] Napaka pri branju salonov:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: { salon: string; ok: boolean; error?: string }[] = [];

  for (const salon of salons ?? []) {
    try {
      const { data: appointments, error: apptError } = await admin
        .from("appointments")
        .select("appointment_time, customer_name, service, employee_id")
        .eq("salon_id", salon.id)
        .eq("appointment_date", today)
        .neq("status", "cancelled")
        .order("appointment_time", { ascending: true });

      if (apptError) throw apptError;

      // VSI zaposleni (tudi deaktivirani, glej pogovor s Claude) - obstoječi
      // termin lahko kaže na medtem deaktiviranega zaposlenega.
      const { data: employees } = await admin
        .from("employees")
        .select("id, name")
        .eq("salon_id", salon.id);
      const employeeNameById = new Map((employees ?? []).map((e) => [e.id, e.name]));

      const { data: authUser, error: authError } = await admin.auth.admin.getUserById(
        salon.user_id
      );
      if (authError || !authUser.user?.email) {
        throw new Error("Ni najti email naslova lastnika.");
      }

      await sendDailyDigest({
        to: authUser.user.email,
        salonName: salon.salon_name,
        dateLabel: dayLabel(today),
        appointments: (appointments ?? []).map((a) => ({
          time: a.appointment_time,
          customerName: a.customer_name,
          service: a.service,
          employeeName: a.employee_id ? (employeeNameById.get(a.employee_id) ?? null) : null,
        })),
      });

      results.push({ salon: salon.salon_name, ok: true });
    } catch (e) {
      console.error(`[cron/daily-digest] Napaka za salon ${salon.salon_name}:`, e);
      results.push({
        salon: salon.salon_name,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    date: today,
    sent: results.filter((r) => r.ok).length,
    total: results.length,
    results,
  });
}
