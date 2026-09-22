import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { toWhatsAppPhone } from "@/lib/constants";
import { isTwilioConfigured, sendSms } from "@/lib/sms";

type CancelledAppointment = {
  id: string;
  salon_id: string;
  appointment_date: string;
  appointment_time: string;
  service: string;
};

// Skupna logika za OBE poti do odpovedi termina - lastnik prek /owner
// (cancelAppointment v owner/actions.ts) IN stranka sama prek
// /rezervacija/[token] (cancelBookingByToken v rezervacija/[token]/actions.ts)
// - prej je bila to samo del owner/actions.ts, zdaj izločeno, da stranka, ki
// odpove SVOJ termin, sproži IST tok obveščanja čakajočih kot bi ga lastnik.
//
// Poišče stranke, ki jih je smiselno obvestiti o sprostitvi, v dveh ločenih
// skupinah (vsaka s svojim sporočilom):
// 1. stranke, ki imajo isti dan že rezerviran kasnejši termin za ISTO
//    storitev - lahko bi prišle prej;
// 2. ljudje na seznamu "Obvesti me", ki so izbrali to storitev (ali "vseeno").
//
// `client` je lahko SEJNI (RLS-scoped, ko kliče lastnik - appointments/
// waitlist RLS že sama omeji na klicateljev salon) ALI admin/service_role
// klient (ko kliče anonimna stranka prek tokena - RLS ji tega ne bi
// dovolila) - oba imata isti TS vmesnik, klicatelj izbere pravega.
export async function notifyAffectedCustomersOfCancellation(
  client: SupabaseClient<Database>,
  appt: CancelledAppointment
) {
  const { data: laterSameService } = await client
    .from("appointments")
    .select("customer_name, customer_phone")
    .eq("salon_id", appt.salon_id)
    .eq("appointment_date", appt.appointment_date)
    .eq("service", appt.service)
    .neq("id", appt.id)
    .neq("status", "cancelled")
    .gt("appointment_time", appt.appointment_time);

  const earlierSlotSeen = new Set<string>();
  const earlierSlotMatches = (laterSameService ?? []).filter((a) => {
    if (earlierSlotSeen.has(a.customer_phone)) return false;
    earlierSlotSeen.add(a.customer_phone);
    return true;
  });

  // Ordered po created_at (prvi prijavljen na čakalno listo je prvi v
  // seznamu) - uporablja tudi owner/page.tsx za prikaz prioritete v gumbu
  // "Ponudi ta termin", zato mora biti vrstni red tu deterministen.
  const { data: waitMatches } = await client
    .from("waitlist")
    .select("*")
    .eq("salon_id", appt.salon_id)
    .eq("preferred_date", appt.appointment_date)
    .in("service_preference", ["vseeno", appt.service])
    .order("created_at", { ascending: true });

  const waitlistSeen = new Set<string>();
  const waitlistMatches = (waitMatches ?? []).filter((w) => {
    if (waitlistSeen.has(w.customer_phone)) return false;
    waitlistSeen.add(w.customer_phone);
    return true;
  });

  const newLogs = [
    ...earlierSlotMatches.map((a) => ({
      salon_id: appt.salon_id,
      recipient_name: a.customer_name,
      recipient_phone: a.customer_phone,
      message: `Sprostil se je zgodnejši termin ob ${appt.appointment_time} - bi rad prišel prej?`,
      reason: "earlier_slot" as const,
      appointment_id: appt.id,
      appointment_date: appt.appointment_date,
    })),
    ...waitlistMatches.map((w) => ({
      salon_id: appt.salon_id,
      recipient_name: w.customer_name,
      recipient_phone: w.customer_phone,
      message: `Sprostil se je termin za ${appt.service} ob ${appt.appointment_time} - se želiš rezervirati?`,
      reason: "waitlist" as const,
      appointment_id: appt.id,
      appointment_date: appt.appointment_date,
    })),
  ];

  if (newLogs.length === 0) return;

  // Fillio Pro: če je salon na 'pro' planu IN je Twilio dejansko
  // konfiguriran (glej src/lib/sms.ts), poskusi vsako obvestilo poslati
  // TAKOJ prek SMS in ga zapiši že kot 'sent'/'failed' - lastniku ni treba
  // ničesar ročno klikati. Free plan (ali 'pro' brez povezanega Twilia)
  // ostane pri obstoječem toku: vrstica ostane 'pending', lastnik jo ročno
  // pošlje prek WhatsApp gumba v zavihku "Ročno".
  let autoSend = false;
  if (isTwilioConfigured()) {
    const { data: owner } = await client
      .from("salon_owners")
      .select("plan")
      .eq("id", appt.salon_id)
      .maybeSingle();
    autoSend = owner?.plan === "pro";
  }

  if (autoSend) {
    for (const log of newLogs) {
      const to = "+" + toWhatsAppPhone(log.recipient_phone);
      const { ok, error } = await sendSms(to, log.message);
      if (!ok) {
        console.error(`Samodejni SMS ni uspel (${log.recipient_phone}):`, error);
      }
      await client.from("sms_notifications").insert({
        ...log,
        status: ok ? "sent" : "failed",
        auto_sent: true,
      });
    }
  } else {
    await client.from("sms_notifications").insert(newLogs);
  }
}
