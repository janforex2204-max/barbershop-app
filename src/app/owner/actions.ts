"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { SHOP_NAME, HOURS, dayLabel, todayISO, weekdayOf, timeBucket } from "@/lib/constants";

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

// Ko stranka iz SMS obvestila potrdi termin: zapolni sproščeni slot z novim
// terminom (status "filled") in obvestilo označi kot prevzeto.
export async function claimFromLog(logId: string) {
  const supabase = await createClient();

  const { data: log } = await supabase
    .from("sms_notifications")
    .select("*")
    .eq("id", logId)
    .single();

  if (!log) return;

  let date = todayISO();
  let time = HOURS[0];
  let service = "Strizenje";

  if (log.appointment_id) {
    const { data: cancelledAppt } = await supabase
      .from("appointments")
      .select("*")
      .eq("id", log.appointment_id)
      .single();

    if (cancelledAppt) {
      date = cancelledAppt.appointment_date;
      time = cancelledAppt.appointment_time;
      service = cancelledAppt.service;
    }
  }

  await supabase.from("appointments").insert({
    customer_name: log.recipient_name,
    customer_phone: log.recipient_phone,
    service,
    appointment_date: date,
    appointment_time: time,
    status: "filled",
  });

  await supabase
    .from("sms_notifications")
    .update({ status: "claimed" })
    .eq("id", logId);

  revalidatePath("/owner");
}
