"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAffectedCustomersOfCancellation } from "@/lib/cancellation";
import { sendWaitlistNotificationEmail } from "@/lib/email";
import { PLATFORM_URL } from "@/lib/constants";
import { OWNER_CALENDAR_TAG } from "./cached-queries";
import { translateAuthError } from "@/lib/auth-errors";
import {
  resolveDayWindow,
  resolveDayBreak,
  isSlotAvailable,
  DEFAULT_SERVICE_DURATION_MINUTES,
} from "@/lib/availability";
import { busyForEmployee, type EmployeeBusyRow } from "@/lib/employee-availability";
import type { NotificationPreference, SalonDayHours } from "@/types/database.types";

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

// Odpove termin in poišče stranke, ki jih je smiselno obvestiti o sprostitvi
// (glej notifyAffectedCustomersOfCancellation v src/lib/cancellation.ts - ISTA
// funkcija, ki jo kliče tudi stranka sama prek /rezervacija/[token], da
// obveščanje čakajočih deluje enako ne glede na to, KDO je odpovedal).
//
// CANCELLATION_NOTICE_HOURS prag (glej src/lib/constants.ts) NAMENOMA velja
// SAMO za stranko (rezervacija/[token]/actions.ts) - lastnik tu ostaja BREZ
// časovne omejitve, kot je bilo prej (eksplicitna zahteva, glej pogovor s
// Claude - lastnik mora vedno lahko odpove, npr. bolezen tik pred terminom).
//
// Izolacija med saloni: appointments/waitlist RLS (salon_id = my_salon_id())
// poskrbi, da poizvedba spodaj že sama po sebi vidi samo vrstice
// klicateljevega lastnega salona.
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

  await notifyAffectedCustomersOfCancellation(supabase, appt);

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

// Kliče se iz LOČENEGA gumba "Pošlji e-pošto" (glej WaitlistNotifyButton na
// owner/page.tsx) - "Pošlji WhatsApp" je čisto klientski wa.me link, brez
// strežnika, popolnoma neodvisen od tega. Nefatalno vrne napako namesto da
// vrže - klicatelj jo prikaže neposredno ob gumbu.
//
// waitlistId (ne surovi email/ime/storitev) je NAMENOMA edini parameter -
// isti razlog kot markSmsSent zgoraj: Server Action je dosegljiv z
// neposrednim POST-om mimo UI-ja, zato mora vsebino vedno sam prebrati iz
// baze (RLS: waitlist_owner_full_access že omeji na klicateljev lasten
// salon), ne zaupati temu, kar bi (ne glede na to od kod) poslal klient.
export async function sendWaitlistNotification(
  waitlistId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: entry } = await supabase
    .from("waitlist")
    .select("customer_email, service_preference, salon_id")
    .eq("id", waitlistId)
    .maybeSingle();

  if (!entry?.customer_email) {
    return {};
  }

  const { data: owner } = await supabase
    .from("salon_owners")
    .select("salon_name, slug")
    .eq("id", entry.salon_id)
    .maybeSingle();

  if (!owner) {
    return {};
  }

  try {
    await sendWaitlistNotificationEmail({
      to: entry.customer_email,
      salonName: owner.salon_name,
      service: entry.service_preference === "vseeno" ? null : entry.service_preference,
      bookingUrl: `${PLATFORM_URL}/${owner.slug}`,
    });
  } catch (e) {
    console.error(`Napaka pri pošiljanju obvestila o prostem terminu (${waitlistId}):`, e);
    return { error: "E-pošta ni bila poslana - WhatsApp sporočilo je bilo odprto." };
  }

  return {};
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
    token: string;
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
  const employee_id = String(formData.get("employee_id") ?? "").trim() || null;

  if (!customer_name || !customer_phone || !service || !appointment_date || !appointment_time) {
    return { error: "Izpolni vsa polja." };
  }

  // Nikoli ne zaupamo employee_id, ki bi ga poslal klient - preveri, da
  // pripada TEMU salonu in je aktiven (isti razlog kot trajanje storitve
  // spodaj). salonHasActiveEmployees odloča o dvonivojskem busy filtru
  // (glej src/lib/employee-availability.ts) NE GLEDE na to, ali je bil
  // employee_id sploh poslan.
  const { data: activeEmployees } = await supabase
    .from("employees")
    .select("id, hours")
    .eq("salon_id", ownerRow.id)
    .eq("active", true);

  const salonHasActiveEmployees = (activeEmployees?.length ?? 0) > 0;
  let effectiveHours = ownerRow.hours;
  if (employee_id) {
    const matchedEmployee = activeEmployees?.find((e) => e.id === employee_id);
    if (!matchedEmployee) {
      return { error: "Izbrani zaposleni ni veljaven." };
    }
    effectiveHours = matchedEmployee.hours;
  }

  const window = resolveDayWindow(effectiveHours, appointment_date);
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
    .select("appointment_time, duration_minutes, employee_id")
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
    busyRows =
      fallback.data?.map((r) => ({ ...r, duration_minutes: null, employee_id: null })) ?? null;
    busyError = fallback.error;
  }

  if (busyError) {
    return { error: "Prišlo je do začasne napake. Poskusi znova čez trenutek." };
  }

  const rawBusy: EmployeeBusyRow[] = (busyRows ?? []).map((r) => ({
    time: r.appointment_time,
    durationMinutes: r.duration_minutes ?? 60,
    employeeId: r.employee_id ?? null,
  }));
  const busy = busyForEmployee(rawBusy, employee_id, salonHasActiveEmployees);
  const dayBreak = resolveDayBreak(effectiveHours, appointment_date);
  if (dayBreak) busy.push(dayBreak);

  if (!isSlotAvailable(window, busy, durationMinutes, appointment_time)) {
    return { error: "Ta termin se prekriva z drugo rezervacijo. Izberi drugega." };
  }

  // Isti vzorec kot bookAppointment v [slug]/actions.ts - glej
  // supabase/schema.sql za razlago (avtorizacija za /rezervacija/[token]).
  const token = randomBytes(32).toString("hex");

  let { error } = await supabase.from("appointments").insert({
    salon_id: ownerRow.id,
    customer_name,
    customer_phone,
    service,
    appointment_date,
    appointment_time,
    duration_minutes: durationMinutes,
    employee_id,
    status: "booked",
    token,
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
      employee_id,
      status: "booked",
      token,
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
      token,
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

// Ista utemeljitev/vzorec kot updateNotificationPreference tik zgoraj -
// salon_owners NIMA "self update" RLS police (namenoma), zato salonId
// razrešimo prek KLICATELJEVE (RLS-zaščitene) seje, sam update pa gre prek
// admin (service_role) klienta. Klicano NEPOSREDNO iz klienta (ne prek
// FormData), glej owner/hours/hours-editor-page.tsx.
export async function updateSalonHours(hours: SalonDayHours[]): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Seja je potekla. Prijavi se znova." };
  }

  const { data: ownerRow } = await supabase
    .from("salon_owners")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();
  if (!ownerRow) {
    return { error: "Račun ni povezan z odobrenim salonom." };
  }

  // Server Action je dosegljiv z neposrednim POST-om mimo UI-ja, zato se ne
  // zanašamo samo na obliko, ki jo DayHoursEditor sicer vedno pošlje.
  if (!Array.isArray(hours) || hours.length === 0) {
    return { error: "Neveljaven urnik." };
  }
  for (const day of hours) {
    if (typeof day?.day !== "string" || typeof day?.closed !== "boolean") {
      return { error: "Neveljaven urnik." };
    }
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("salon_owners")
    .update({ hours })
    .eq("id", ownerRow.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/owner/hours");
  revalidatePath("/owner");
  return {};
}

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
const LOGO_EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

// Nalaganje logotipa gre NEPOSREDNO skozi admin klienta (ne s session-scoped
// browser klienta prek Storage RLS, kot je bilo prvotno) - v praksi je
// "salon_logos_owner_insert" politika v supabase/schema.sql pri realnem
// nalaganju vrgla "new row violates row-level security policy" (glej
// pogovor s Claude), verjetno zaradi neusklajene seje med SSR stranjo in
// browser Storage klicem. Isti razlog kot povsod drugod v tej datoteki -
// lastništvo/status preverimo TUKAJ (meja zaupanja) prek cookie-scoped
// klienta, dejanski zapis (Storage + salon_owners.logo_url) pa naredi
// admin klient, ki RLS v celoti obide.
export async function uploadSalonLogo(formData: FormData): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Seja je potekla. Prijavi se znova." };
  }

  const { data: ownerRow } = await supabase
    .from("salon_owners")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();
  if (!ownerRow) {
    return { error: "Račun ni povezan z odobrenim salonom." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Datoteka manjka." };
  }

  const ext = LOGO_EXT_BY_TYPE[file.type];
  if (!ext) {
    return { error: "Dovoljeni formati: PNG, JPEG ali WebP." };
  }
  if (file.size > MAX_LOGO_SIZE_BYTES) {
    return { error: "Datoteka je prevelika (največ 2 MB)." };
  }

  const admin = createAdminClient();
  // "logo.<ext>" (ne izvirno ime datoteke) + upsert - vedno ISTA pot za TA
  // salon, zato nova nalaganja preprosto prepišejo prejšnjo.
  const path = `${ownerRow.id}/logo.${ext}`;
  const { error: uploadError } = await admin.storage
    .from("salon-logos")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) {
    return { error: uploadError.message };
  }

  const { data } = admin.storage.from("salon-logos").getPublicUrl(path);
  // Cache-bust - pot je zaradi upsert vedno ista, brez tega bi brskalnik
  // (ali CDN) po zamenjavi logotipa lahko še vedno prikazoval STAREGA.
  const publicUrl = `${data.publicUrl}?v=${Date.now()}`;

  const { error: dbError } = await admin
    .from("salon_owners")
    .update({ logo_url: publicUrl })
    .eq("id", ownerRow.id);
  if (dbError) {
    return { error: dbError.message };
  }

  revalidatePath("/owner");
  return { url: publicUrl };
}
