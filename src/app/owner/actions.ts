"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { SHOP_NAME, dayLabel, weekdayOf, timeBucket, isBusinessDay } from "@/lib/constants";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/owner/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/owner");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/owner/login");
}

// Odpove termin in poišče stranke, ki jih je smiselno obvestiti o sprostitvi:
// 1. čakalna vrsta za ta dan (ki ustreza dopoldan/popoldan preferenci),
// 2. pretekle stranke, ki so na ta isti dan v tednu + uro že rezervirale
//    (ujemanje vzorca), brez podvajanja telefonskih številk iz #1.
export async function cancelAppointment(appointmentId: string) {
  const supabase = await createClient();

  const { data: appt } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .single();

  if (!appt) return;

  await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", appointmentId);

  const bucket = timeBucket(appt.appointment_time);
  const { data: waitMatches } = await supabase
    .from("waitlist")
    .select("*")
    .eq("preferred_date", appt.appointment_date)
    .in("time_preference", ["vseeno", bucket]);

  const wd = weekdayOf(appt.appointment_date);
  const { data: sameTimeAppts } = await supabase
    .from("appointments")
    .select("customer_name, customer_phone, appointment_date")
    .eq("appointment_time", appt.appointment_time)
    .neq("id", appointmentId)
    .neq("status", "cancelled");

  const seenPhones = new Set((waitMatches ?? []).map((w) => w.customer_phone));
  const patternMatches: { customer_name: string; customer_phone: string }[] = [];
  const patternSeen = new Set<string>();
  for (const a of sameTimeAppts ?? []) {
    if (weekdayOf(a.appointment_date) !== wd) continue;
    if (seenPhones.has(a.customer_phone) || patternSeen.has(a.customer_phone)) continue;
    patternSeen.add(a.customer_phone);
    patternMatches.push(a);
  }

  const newLogs = [
    ...(waitMatches ?? []).map((w) => ({
      recipient_name: w.customer_name,
      recipient_phone: w.customer_phone,
      message: `Sprostil se je termin ob ${appt.appointment_time} (${dayLabel(
        appt.appointment_date
      )}) pri ${SHOP_NAME}. Odgovori DA za rezervacijo.`,
      reason: "waitlist" as const,
      appointment_id: appointmentId,
    })),
    ...patternMatches.map((p) => ({
      recipient_name: p.customer_name,
      recipient_phone: p.customer_phone,
      message: `Prost termin ob ${appt.appointment_time} (${dayLabel(
        appt.appointment_date
      )}) — tvoj običajni čas pri ${SHOP_NAME}. Odgovori DA za rezervacijo.`,
      reason: "pattern_match" as const,
      appointment_id: appointmentId,
    })),
  ];

  if (newLogs.length > 0) {
    await supabase.from("sms_notifications").insert(newLogs);
  }

  revalidatePath("/owner");
}

// Ko lastnik pošlje pripravljeno WhatsApp sporočilo stranki, obvestilo
// označimo kot obravnavano (izgine s seznama čakajočih). Če stranka termin
// dejansko potrdi, ga lastnik doda ročno prek "Dodaj termin" obrazca.
export async function markSmsSent(logId: string) {
  const supabase = await createClient();

  await supabase
    .from("sms_notifications")
    .update({ status: "sent" })
    .eq("id", logId);

  revalidatePath("/owner");
}

export type ManualBookingState = { error?: string; success?: boolean };

// Lastnik ročno doda termin (npr. telefonska rezervacija mimo spletnega obrazca).
export async function addManualAppointment(
  _prevState: ManualBookingState,
  formData: FormData
): Promise<ManualBookingState> {
  const supabase = await createClient();

  const customer_name = String(formData.get("customer_name") ?? "").trim();
  const customer_phone = String(formData.get("customer_phone") ?? "").trim();
  const service = String(formData.get("service") ?? "").trim();
  const appointment_date = String(formData.get("appointment_date") ?? "");
  const appointment_time = String(formData.get("appointment_time") ?? "");

  if (!customer_name || !customer_phone || !service || !appointment_date || !appointment_time) {
    return { error: "Izpolni vsa polja." };
  }

  if (!isBusinessDay(appointment_date)) {
    return { error: "Salon ta dan ne dela (odprto torek-sobota)." };
  }

  const { error } = await supabase.from("appointments").insert({
    customer_name,
    customer_phone,
    service,
    appointment_date,
    appointment_time,
    status: "booked",
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Ta termin je bil pravkar zaseden. Izberi drugega." };
    }
    return { error: error.message };
  }

  revalidatePath("/owner");
  return { success: true };
}
