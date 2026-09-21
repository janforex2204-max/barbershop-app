"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { dayLabel, isValidCustomerName, isValidPhone } from "@/lib/constants";
import { sendBookingNotification } from "@/lib/email";
import {
  resolveDayWindow,
  isSlotAvailable,
  DEFAULT_SERVICE_DURATION_MINUTES,
  type BusyInterval,
} from "@/lib/availability";
import type { SalonDayHours } from "@/types/database.types";

// KRITIČNO: salon_id se za VSAK klic izpelje TUKAJ, na strežniku, iz `slug`
// prek public_salons (samo odobreni saloni) - nikoli se ne sprejme salon_id,
// ki bi ga (ne glede na to od kod) poslal klient. Tudi če klient pošlje
// popolnoma poljuben `slug`, dobi kvečjemu rezervacijo PRI TISTEM salonu -
// nikoli ne more "podtakniti" tuje salon_id vrednosti drugam.
//
// POMEMBNO: ločimo "slug res ne obstaja" (data je null, BREZ error) od
// "poizvedba je spodletela" (error prisoten - npr. začasna PostgREST
// schema-cache napaka tik po migraciji, ali omrežna težava; to smo v tem
// projektu dejansko že videli v dev logih za drugo tabelo). Prej se je
// `error` tiho zavrgel in VSAKA napaka je izpadla kot "Salon ne obstaja.",
// kar je zavajajoče (salon dejansko obstaja) in stranki ne pove, da gre za
// prehodno težavo, ki jo reši ponovni poskus.
// `hours` dodan poleg id-ja, ker ga bookAppointment spodaj potrebuje za
// ponovno preverbo prekrivanja na strežniku (isti klic, ena poizvedba več
// polj - joinWaitlist ga preprosto ne uporabi).
async function resolveSalonId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slug: string
): Promise<{ salonId: string | null; hours: SalonDayHours[] | null; error: string | null }> {
  let { data, error } = await supabase
    .from("public_salons")
    .select("id, hours")
    .eq("slug", slug)
    .maybeSingle();

  // Ista prehodna varovalka kot v [slug]/page.tsx - dokler public_salons
  // view morda še ni osvežen z `hours` stolpcem, ne sme rezervacija pasti v
  // napako samo zato, ker manjka delovni čas (glej resolveDayWindow -
  // hours=null uporabi privzet delovni čas namesto napake).
  if (error?.code === "42703") {
    console.error(
      `[${slug}] public_salons.hours še ne obstaja (manjkajoča migracija) - nadaljujem s privzetim delovnim časom.`
    );
    const fallback = await supabase
      .from("public_salons")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    data = fallback.data ? { ...fallback.data, hours: null } : null;
    error = fallback.error;
  }

  if (error) {
    console.error(`[${slug}] Napaka pri razreševanju salona:`, error.message);
    return {
      salonId: null,
      hours: null,
      error: "Prišlo je do začasne napake. Poskusi znova čez trenutek.",
    };
  }
  if (!data) {
    return { salonId: null, hours: null, error: "Salon ne obstaja." };
  }
  return { salonId: data.id, hours: data.hours, error: null };
}

// Pošlje lastniku email TAKOJ ob novi rezervaciji, če ima to vklopljeno
// (glej salon_owners.notification_preference, nastavljivo na /owner - glej
// owner/notification-settings.tsx). Anon klient (stranka, ki rezervira) ne
// more sam brati salon_owners (RLS jo omeji na "svojega" lastnika, glej
// salon_owners_self_select v supabase/schema.sql) - zato tu admin klient, z
// eksplicitnim `.eq("id", salonId)`, kjer je salonId ŽE zaupanja vreden
// (razrešen prek resolveSalonId zgoraj, ne iz podatkov klienta). NAMENOMA
// nefatalno (try/catch, klicatelj ne čaka na rezultat) - stranki mora
// rezervacija uspeti tudi, če email pošiljanje odpove.
async function notifyOwnerOfBooking(
  salonId: string,
  booking: { name: string; phone: string; service: string; date: string; time: string }
) {
  try {
    const admin = createAdminClient();
    const { data: owner } = await admin
      .from("salon_owners")
      .select("plan, notification_preference, user_id, salon_name")
      .eq("id", salonId)
      .maybeSingle();

    if (!owner || owner.plan !== "pro" || owner.notification_preference !== "per_booking") {
      return;
    }

    const { data: authUser, error: authError } = await admin.auth.admin.getUserById(
      owner.user_id
    );
    if (authError || !authUser.user?.email) {
      console.error(`[${salonId}] Ni bilo mogoče najti email naslova lastnika za obvestilo.`);
      return;
    }

    await sendBookingNotification({
      to: authUser.user.email,
      salonName: owner.salon_name,
      customerName: booking.name,
      customerPhone: booking.phone,
      service: booking.service,
      dateLabel: dayLabel(booking.date),
      time: booking.time,
    });
  } catch (e) {
    console.error(`[${salonId}] Napaka pri pošiljanju email obvestila o rezervaciji:`, e);
  }
}

export async function bookAppointment(
  slug: string,
  input: { name: string; phone: string; service: string; date: string; time: string }
): Promise<{ error?: string }> {
  // Server Action je dosegljiv z neposrednim POST-om mimo UI-ja, zato se ne
  // zanašamo samo na validacijo v booking-page.tsx (glej isValidCustomerName/
  // isValidPhone v src/lib/constants.ts za pravili in razlago).
  if (!isValidCustomerName(input.name)) {
    return { error: "Vnesi ime in priimek (vsaj 3 znaki, npr. \"Jan Novak\")." };
  }
  if (!isValidPhone(input.phone)) {
    return { error: "Vnesi veljavno telefonsko številko (npr. 040 123 456)." };
  }

  const supabase = await createClient();
  const { salonId, hours, error: resolveError } = await resolveSalonId(supabase, slug);

  if (!salonId) {
    return { error: resolveError ?? "Salon ne obstaja." };
  }

  // Preprečuje zlorabo (nekdo hitro zaporedoma zasede vse proste termine z
  // izmišljenimi podatki) - glej src/lib/rate-limit.ts za oba limita.
  const ip = await getClientIp();
  const { limited, message } = await checkRateLimit("appointments", input.phone, ip);
  if (limited) {
    return { error: message };
  }

  // Trajanje IZBRANE storitve razrešimo TU, na strežniku, iz baze - nikoli
  // ne zaupamo trajanju, ki bi ga (ne glede na to od kod) poslal klient,
  // isti vzorec kot salon_id zgoraj.
  const { data: serviceRow } = await supabase
    .from("services")
    .select("duration_minutes")
    .eq("salon_id", salonId)
    .eq("name", input.service)
    .eq("active", true)
    .maybeSingle();
  const durationMinutes = serviceRow?.duration_minutes ?? DEFAULT_SERVICE_DURATION_MINUTES;

  // Ponovna preverba prekrivanja NA STREŽNIKU tik pred vpisom - klientov
  // seznam prostih terminov (booking-page.tsx) je lahko zastarel (druga
  // stranka je medtem rezervirala) ali klient preprosto POŠLJE poljuben čas
  // mimo UI-ja (glej komentar zgoraj o neposrednem POST-u). Spodnji unique
  // index še vedno lovi IDENTIČEN čas kot zadnjo varovalko, tole pa lovi
  // PREKRIVAJOČE se, a različne čase, ki jih index ne bi zaznal.
  let { data: busyRows, error: busyError } = await supabase
    .from("public_availability")
    .select("appointment_time, duration_minutes")
    .eq("salon_id", salonId)
    .eq("appointment_date", input.date);

  // Ista prehodna varovalka kot pri public_salons.hours zgoraj - dokler
  // public_availability view morda še ni osvežen z `duration_minutes`.
  if (busyError?.code === "42703") {
    console.error(
      `[${slug}] public_availability.duration_minutes še ne obstaja (manjkajoča migracija) - privzemam 60 min za obstoječe termine.`
    );
    const fallback = await supabase
      .from("public_availability")
      .select("appointment_time")
      .eq("salon_id", salonId)
      .eq("appointment_date", input.date);
    busyRows = fallback.data?.map((r) => ({ ...r, duration_minutes: null })) ?? null;
    busyError = fallback.error;
  }

  if (busyError) {
    console.error(`[${slug}] Napaka pri preverjanju zasedenosti:`, busyError.message);
    return { error: "Prišlo je do začasne napake. Poskusi znova čez trenutek." };
  }

  const busy: BusyInterval[] = (busyRows ?? []).map((r) => ({
    time: r.appointment_time,
    durationMinutes: r.duration_minutes ?? 60,
  }));
  const window = resolveDayWindow(hours, input.date);

  if (!isSlotAvailable(window, busy, durationMinutes, input.time)) {
    return { error: "Ta termin ni več na voljo za izbrano storitev. Izberi drugega." };
  }

  let { error } = await supabase.from("appointments").insert({
    salon_id: salonId,
    customer_name: input.name,
    customer_phone: input.phone,
    service: input.service,
    appointment_date: input.date,
    appointment_time: input.time,
    duration_minutes: durationMinutes,
    status: "booked",
    ip_address: ip,
  });

  // KRITIČNA varovalka - če appointments.duration_minutes migracija še ni
  // zagnana, tale insert BREZ nje popolnoma blokira VSAKO rezervacijo na
  // platformi (ne samo prikaz cene/trajanja kot pri zgornjih fallbackih),
  // dokler nekdo ne požene SQL-ja - enak vzorec, samo bistveno višji vpliv.
  // Termin se v tem primeru vseeno zapiše, samo brez duration_minutes
  // (izračun prekrivanja zanj kasneje pade nazaj na privzetih 60 min, glej
  // loadAvailability v booking-page.tsx).
  if (error?.code === "42703") {
    console.error(
      `[${slug}] appointments.duration_minutes še ne obstaja (manjkajoča migracija) - vpisujem termin brez njega.`
    );
    const fallback = await supabase.from("appointments").insert({
      salon_id: salonId,
      customer_name: input.name,
      customer_phone: input.phone,
      service: input.service,
      appointment_date: input.date,
      appointment_time: input.time,
      status: "booked",
      ip_address: ip,
    });
    error = fallback.error;
  }

  if (error) {
    if (error.code === "23505") {
      return { error: "Ta termin je bil pravkar zaseden. Izberi drugega." };
    }
    return { error: error.message };
  }

  await notifyOwnerOfBooking(salonId, input);

  return {};
}

export async function joinWaitlist(
  slug: string,
  input: { name: string; phone: string; service: string; date: string }
): Promise<{ error?: string }> {
  if (!isValidCustomerName(input.name)) {
    return { error: "Vnesi ime in priimek (vsaj 3 znaki, npr. \"Jan Novak\")." };
  }
  if (!isValidPhone(input.phone)) {
    return { error: "Vnesi veljavno telefonsko številko (npr. 040 123 456)." };
  }

  const supabase = await createClient();
  const { salonId, error: resolveError } = await resolveSalonId(supabase, slug);

  if (!salonId) {
    return { error: resolveError ?? "Salon ne obstaja." };
  }

  const ip = await getClientIp();
  const { limited, message } = await checkRateLimit("waitlist", input.phone, ip);
  if (limited) {
    return { error: message };
  }

  const { error } = await supabase.from("waitlist").insert({
    salon_id: salonId,
    customer_name: input.name,
    customer_phone: input.phone,
    preferred_date: input.date,
    service_preference: input.service,
    ip_address: ip,
  });

  if (error) {
    return { error: error.message };
  }

  return {};
}
