"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isBusinessDay } from "@/lib/constants";

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

// Odpove termin in poišče stranke, ki jih je smiselno obvestiti o sprostitvi,
// v dveh ločenih skupinah (vsaka s svojim sporočilom):
// 1. stranke, ki imajo isti dan že rezerviran kasnejši termin za ISTO
//    storitev - lahko bi prišle prej;
// 2. ljudje na seznamu "Obvesti me", ki so izbrali to storitev (ali "vseeno").
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

  const { data: laterSameService } = await supabase
    .from("appointments")
    .select("customer_name, customer_phone")
    .eq("appointment_date", appt.appointment_date)
    .eq("service", appt.service)
    .neq("id", appointmentId)
    .neq("status", "cancelled")
    .gt("appointment_time", appt.appointment_time);

  const earlierSlotSeen = new Set<string>();
  const earlierSlotMatches = (laterSameService ?? []).filter((a) => {
    if (earlierSlotSeen.has(a.customer_phone)) return false;
    earlierSlotSeen.add(a.customer_phone);
    return true;
  });

  const { data: waitMatches } = await supabase
    .from("waitlist")
    .select("*")
    .eq("preferred_date", appt.appointment_date)
    .in("service_preference", ["vseeno", appt.service]);

  const waitlistSeen = new Set<string>();
  const waitlistMatches = (waitMatches ?? []).filter((w) => {
    if (waitlistSeen.has(w.customer_phone)) return false;
    waitlistSeen.add(w.customer_phone);
    return true;
  });

  const newLogs = [
    ...earlierSlotMatches.map((a) => ({
      recipient_name: a.customer_name,
      recipient_phone: a.customer_phone,
      message: `Sprostil se je zgodnejši termin ob ${appt.appointment_time} - bi rad prišel prej?`,
      reason: "earlier_slot" as const,
      appointment_id: appointmentId,
      appointment_date: appt.appointment_date,
    })),
    ...waitlistMatches.map((w) => ({
      recipient_name: w.customer_name,
      recipient_phone: w.customer_phone,
      message: `Sprostil se je termin za ${appt.service} ob ${appt.appointment_time} - se želiš rezervirati?`,
      reason: "waitlist" as const,
      appointment_id: appointmentId,
      appointment_date: appt.appointment_date,
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
