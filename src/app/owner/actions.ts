"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toWhatsAppPhone } from "@/lib/constants";
import { isTwilioConfigured, sendSms } from "@/lib/sms";
import { OWNER_CALENDAR_TAG } from "./cached-queries";
import { translateAuthError } from "@/lib/auth-errors";
import {
  resolveDayWindow,
  isSlotAvailable,
  DEFAULT_SERVICE_DURATION_MINUTES,
  type BusyInterval,
} from "@/lib/availability";
import type { NotificationPreference } from "@/types/database.types";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error("[login] signInWithPassword:", error.message);
    redirect(`/owner/login?error=${encodeURIComponent(translateAuthError(error.message))}`);
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
//
// Izolacija med saloni: appointments/waitlist RLS (salon_id = my_salon_id())
// poskrbi, da VSE poizvedbe spodaj že same po sebi vidijo samo vrstice
// klicateljevega lastnega salona - eksplicitnega filtra po salon_id tu ni
// treba dodajati (edina izjema je INSERT v sms_notifications, kjer moramo
// salon_id sami nastaviti - glej appt.salon_id spodaj).
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

  // Ordered po created_at (prvi prijavljen na čakalno listo je prvi v
  // seznamu) - uporablja tudi owner/page.tsx za prikaz prioritete v gumbu
  // "Ponudi ta termin", zato mora biti vrstni red tu deterministen.
  const { data: waitMatches } = await supabase
    .from("waitlist")
    .select("*")
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
      appointment_id: appointmentId,
      appointment_date: appt.appointment_date,
    })),
    ...waitlistMatches.map((w) => ({
      salon_id: appt.salon_id,
      recipient_name: w.customer_name,
      recipient_phone: w.customer_phone,
      message: `Sprostil se je termin za ${appt.service} ob ${appt.appointment_time} - se želiš rezervirati?`,
      reason: "waitlist" as const,
      appointment_id: appointmentId,
      appointment_date: appt.appointment_date,
    })),
  ];

  if (newLogs.length > 0) {
    // Fillio Pro: če je salon na 'pro' planu IN je Twilio dejansko
    // konfiguriran (glej src/lib/sms.ts), poskusi vsako obvestilo poslati
    // TAKOJ prek SMS in ga zapiši že kot 'sent'/'failed' - lastniku ni treba
    // ničesar ročno klikati. Free plan (ali 'pro' brez povezanega Twilia)
    // ostane pri obstoječem toku: vrstica ostane 'pending', lastnik jo
    // ročno pošlje prek WhatsApp gumba v zavihku "Ročno".
    let autoSend = false;
    if (isTwilioConfigured()) {
      const { data: owner } = await supabase
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
        await supabase.from("sms_notifications").insert({
          ...log,
          status: ok ? "sent" : "failed",
          auto_sent: true,
        });
      }
    } else {
      await supabase.from("sms_notifications").insert(newLogs);
    }
  }

  updateTag(OWNER_CALENDAR_TAG);
  revalidatePath("/owner");
}

// Ko lastnik pošlje pripravljeno WhatsApp sporočilo stranki, obvestilo
// označimo kot obravnavano (izgine s seznama čakajočih). Če stranka termin
// dejansko potrdi, ga lastnik doda ročno prek "Dodaj termin" obrazca.
// (sms_notifications RLS že sama omeji to na klicateljev lasten salon.)
export async function markSmsSent(logId: string) {
  const supabase = await createClient();

  await supabase
    .from("sms_notifications")
    .update({ status: "sent" })
    .eq("id", logId);

  updateTag(OWNER_CALENDAR_TAG);
  revalidatePath("/owner");
}

export type ManualBookingState = {
  error?: string;
  success?: boolean;
  booked?: {
    name: string;
    phone: string;
    date: string;
    time: string;
    service: string;
    salonName: string;
  };
};

// Lastnik ročno doda termin (npr. telefonska rezervacija mimo spletnega
// obrazca). salon_id NAMENOMA razrešimo tu, s strežniške seje klicatelja -
// nikoli iz podatkov, ki bi jih poslal klient (form ne vsebuje salon_id),
// da se termina ne bi dalo "podtakniti" v tuj salon.
export async function addManualAppointment(
  _prevState: ManualBookingState,
  formData: FormData
): Promise<ManualBookingState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Seja je potekla. Prijavi se znova." };
  }

  const { data: ownerRow } = await supabase
    .from("salon_owners")
    .select("id, salon_name, hours")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();

  if (!ownerRow) {
    return { error: "Račun ni povezan z odobrenim salonom." };
  }

  const customer_name = String(formData.get("customer_name") ?? "").trim();
  const customer_phone = String(formData.get("customer_phone") ?? "").trim();
  const service = String(formData.get("service") ?? "").trim();
  const appointment_date = String(formData.get("appointment_date") ?? "");
  const appointment_time = String(formData.get("appointment_time") ?? "");

  if (!customer_name || !customer_phone || !service || !appointment_date || !appointment_time) {
    return { error: "Izpolni vsa polja." };
  }

  const window = resolveDayWindow(ownerRow.hours, appointment_date);
  if (!window) {
    return { error: "Salon ta dan ne dela." };
  }

  // Trajanje IZBRANE storitve razrešimo TU, na strežniku - isti vzorec kot
  // bookAppointment v [slug]/actions.ts (nikoli ne zaupamo trajanju, ki bi
  // ga poslal klient - obrazec ga sploh ne pošilja).
  const { data: serviceRow } = await supabase
    .from("services")
    .select("duration_minutes")
    .eq("salon_id", ownerRow.id)
    .eq("name", service)
    .eq("active", true)
    .maybeSingle();
  const durationMinutes = serviceRow?.duration_minutes ?? DEFAULT_SERVICE_DURATION_MINUTES;

  // Ponovna preverba prekrivanja NA STREŽNIKU tik pred vpisom - isti razlog
  // kot na [slug]/actions.ts: klientov seznam prostih terminov je lahko
  // zastarel, ali kdo pošlje POST mimo UI-ja. Beremo NEPOSREDNO iz
  // appointments (RLS: appointments_owner_full_access), ne prek
  // public_availability - lastnik že ima dostop do svoje tabele.
  let { data: busyRows, error: busyError } = await supabase
    .from("appointments")
    .select("appointment_time, duration_minutes")
    .eq("salon_id", ownerRow.id)
    .eq("appointment_date", appointment_date)
    .neq("status", "cancelled");

  // Prehodna varovalka: dokler appointments.duration_minutes morda še ni v
  // produkcijski bazi (isti vzorec kot [slug]/actions.ts) - brez tega bi
  // manjkajoč stolpec blokiral CEL ročni vnos, ne samo prikaz trajanja.
  if (busyError?.code === "42703") {
    const fallback = await supabase
      .from("appointments")
      .select("appointment_time")
      .eq("salon_id", ownerRow.id)
      .eq("appointment_date", appointment_date)
      .neq("status", "cancelled");
    busyRows = fallback.data?.map((r) => ({ ...r, duration_minutes: null })) ?? null;
    busyError = fallback.error;
  }

  if (busyError) {
    return { error: "Prišlo je do začasne napake. Poskusi znova čez trenutek." };
  }

  const busy: BusyInterval[] = (busyRows ?? []).map((r) => ({
    time: r.appointment_time,
    durationMinutes: r.duration_minutes ?? 60,
  }));

  if (!isSlotAvailable(window, busy, durationMinutes, appointment_time)) {
    return { error: "Ta termin se prekriva z drugo rezervacijo. Izberi drugega." };
  }

  let { error } = await supabase.from("appointments").insert({
    salon_id: ownerRow.id,
    customer_name,
    customer_phone,
    service,
    appointment_date,
    appointment_time,
    duration_minutes: durationMinutes,
    status: "booked",
  });

  // Ista KRITIČNA varovalka kot v [slug]/actions.ts bookAppointment - brez
  // nje bi manjkajoč stolpec blokiral VSAK ročni vnos, dokler nekdo ne
  // požene SQL migracije.
  if (error?.code === "42703") {
    const fallback = await supabase.from("appointments").insert({
      salon_id: ownerRow.id,
      customer_name,
      customer_phone,
      service,
      appointment_date,
      appointment_time,
      status: "booked",
    });
    error = fallback.error;
  }

  if (error) {
    if (error.code === "23505") {
      return { error: "Ta termin je bil pravkar zaseden. Izberi drugega." };
    }
    return { error: error.message };
  }

  updateTag(OWNER_CALENDAR_TAG);
  revalidatePath("/owner");
  return {
    success: true,
    booked: {
      name: customer_name,
      phone: customer_phone,
      date: appointment_date,
      time: appointment_time,
      service,
      salonName: ownerRow.salon_name,
    },
  };
}

const NOTIFICATION_PREFERENCES: NotificationPreference[] = ["off", "daily", "per_booking"];

// Lastnik sam izbere email obveščanje (glej ./notification-settings.tsx).
// salon_owners NIMA "self update" RLS police (namenoma - lastnik ne sme sam
// spreminjati npr. status/plan, glej supabase/schema.sql), zato gre prek
// admin klienta - isti vzorec kot addManualAppointment zgoraj: salonId se
// razreši TU, iz klicateljeve LASTNE (RLS-zaščitene) seje, nikoli iz
// podatkov, ki bi jih poslal klient, in update eksplicitno spremeni SAMO
// notification_preference (nič drugega).
export async function updateNotificationPreference(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/owner/login");
  }

  const { data: ownerRow } = await supabase
    .from("salon_owners")
    .select("id, plan")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();
  if (!ownerRow) {
    redirect("/owner");
  }

  const requested = String(formData.get("notification_preference") ?? "off");
  const preference = NOTIFICATION_PREFERENCES.includes(requested as NotificationPreference)
    ? (requested as NotificationPreference)
    : "off";

  // Strežniško preverjanje, NE samo onemogočen UI - "daily"/"per_booking" sta
  // na voljo samo za plan 'pro', ne glede na to, kaj bi (morda z ročno
  // sestavljenim POST-om, mimo onemogočenih radio gumbov) poslal klient.
  const finalPreference: NotificationPreference = ownerRow.plan === "pro" ? preference : "off";

  const admin = createAdminClient();
  await admin
    .from("salon_owners")
    .update({ notification_preference: finalPreference })
    .eq("id", ownerRow.id);

  revalidatePath("/owner");
}
