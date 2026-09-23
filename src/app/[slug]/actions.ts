"use server";

import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  dayLabel,
  isValidCustomerName,
  isValidPhone,
  isValidEmail,
  bookingManageUrl,
} from "@/lib/constants";
import { sendBookingNotification, sendBookingConfirmationEmail } from "@/lib/email";
import {
  resolveDayWindow,
  resolveDayBreak,
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
): Promise<{
  salonId: string | null;
  hours: SalonDayHours[] | null;
  salonName: string | null;
  error: string | null;
}> {
  let { data, error } = await supabase
    .from("public_salons")
    .select("id, hours, salon_name")
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
      .select("id, salon_name")
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
      salonName: null,
      error: "Prišlo je do začasne napake. Poskusi znova čez trenutek.",
    };
  }
  if (!data) {
    return { salonId: null, hours: null, salonName: null, error: "Salon ne obstaja." };
  }
  return { salonId: data.id, hours: data.hours, salonName: data.salon_name, error: null };
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

// Pošlje STRANKI enkratno potrditveno e-pošto - skupna pomožna funkcija za
// OBA primera: (1) email je bil vpisan že v obrazcu za rezervacijo, pošlje
// se TAKOJ ob uspešni rezervaciji (glej bookAppointment spodaj), ali (2)
// stranka ga doda naknadno na potrditveni strani, ko ga ob rezervaciji ni
// vpisala (glej addBookingConfirmationEmail spodaj). Nefatalno (try/catch),
// isti razlog kot notifyOwnerOfBooking zgoraj - rezervacija/shranjevanje
// e-pošte mora uspeti tudi, če email pošiljanje odpove.
async function notifyCustomerOfBooking(
  email: string,
  booking: { salonName: string; service: string; date: string; time: string; token: string }
) {
  try {
    await sendBookingConfirmationEmail({
      to: email,
      salonName: booking.salonName,
      service: booking.service,
      dateLabel: dayLabel(booking.date),
      time: booking.time,
      manageUrl: bookingManageUrl(booking.token),
    });
  } catch (e) {
    console.error(`Napaka pri pošiljanju potrditvene e-pošte (${email}):`, e);
  }
}

export async function bookAppointment(
  slug: string,
  input: { name: string; phone: string; email?: string; service: string; date: string; time: string }
): Promise<{ error?: string; token?: string }> {
  // Server Action je dosegljiv z neposrednim POST-om mimo UI-ja, zato se ne
  // zanašamo samo na validacijo v booking-page.tsx (glej isValidCustomerName/
  // isValidPhone v src/lib/constants.ts za pravili in razlago).
  if (!isValidCustomerName(input.name)) {
    return { error: "Vnesi ime in priimek (vsaj 3 znaki, npr. \"Jan Novak\")." };
  }
  if (!isValidPhone(input.phone)) {
    return { error: "Vnesi veljavno telefonsko številko (npr. 040 123 456)." };
  }
  // Neobvezno polje - prazno je v redu, NEPRAVILNO vneseno pa ne (raje
  // zavrni takoj kot tiho izgubi možnost potrditve/upravljanja termina).
  const email = input.email?.trim() || null;
  if (email && !isValidEmail(email)) {
    return { error: "Email naslov ni veljaven (ali pusti polje prazno)." };
  }

  const supabase = await createClient();
  const { salonId, hours, salonName, error: resolveError } = await resolveSalonId(supabase, slug);

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
  const dayBreak = resolveDayBreak(hours, input.date);
  if (dayBreak) busy.push(dayBreak);
  const window = resolveDayWindow(hours, input.date);

  if (!isSlotAvailable(window, busy, durationMinutes, input.time)) {
    return { error: "Ta termin ni več na voljo za izbrano storitev. Izberi drugega." };
  }

  // Isti vzorec kot salon_owners.approval_token (admin/approve/route.ts) -
  // glej supabase/schema.sql za polno razlago. Avtorizacija za
  // /rezervacija/[token] (glej ta pogovor s Claude).
  const token = randomBytes(32).toString("hex");

  let { error } = await supabase.from("appointments").insert({
    salon_id: salonId,
    customer_name: input.name,
    customer_phone: input.phone,
    customer_email: email,
    service: input.service,
    appointment_date: input.date,
    appointment_time: input.time,
    duration_minutes: durationMinutes,
    status: "booked",
    ip_address: ip,
    token,
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
      customer_email: email,
      service: input.service,
      appointment_date: input.date,
      appointment_time: input.time,
      status: "booked",
      ip_address: ip,
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

  await notifyOwnerOfBooking(salonId, input);
  if (email) {
    await notifyCustomerOfBooking(email, {
      salonName: salonName ?? "Fillio",
      service: input.service,
      date: input.date,
      time: input.time,
      token,
    });
  }

  return { token };
}

// Klicano iz potrditvene strani (booking-page.tsx), SAMO če stranka e-pošte
// ni vpisala že v sam obrazec za rezervacijo (glej bookAppointment/
// notifyCustomerOfBooking zgoraj - to je privzeta pot). Token JE
// avtorizacija (admin klient, ker anon nima UPDATE pravice na appointments,
// glej supabase/schema.sql) - ni dodatnega preverjanja "lastništva", kdorkoli
// pozna svoj lasten, neuganljiv token.
export async function addBookingConfirmationEmail(
  token: string,
  email: string
): Promise<{ error?: string }> {
  const trimmedEmail = email.trim();
  if (!isValidEmail(trimmedEmail)) {
    return { error: "Vnesi veljaven email naslov." };
  }

  const admin = createAdminClient();
  const { data: appt } = await admin
    .from("appointments")
    .select("salon_id, service, appointment_date, appointment_time")
    .eq("token", token)
    .maybeSingle();

  if (!appt) {
    return { error: "Rezervacija ne obstaja." };
  }

  const { error } = await admin
    .from("appointments")
    .update({ customer_email: trimmedEmail })
    .eq("token", token);

  if (error) {
    return { error: error.message };
  }

  const { data: salon } = await admin
    .from("salon_owners")
    .select("salon_name")
    .eq("id", appt.salon_id)
    .maybeSingle();

  await notifyCustomerOfBooking(trimmedEmail, {
    salonName: salon?.salon_name ?? "Fillio",
    service: appt.service,
    date: appt.appointment_date,
    time: appt.appointment_time,
    token,
  });

  return {};
}

export async function joinWaitlist(
  slug: string,
  input: { name: string; phone: string; email?: string; service: string; date: string }
): Promise<{ error?: string }> {
  if (!isValidCustomerName(input.name)) {
    return { error: "Vnesi ime in priimek (vsaj 3 znaki, npr. \"Jan Novak\")." };
  }
  if (!isValidPhone(input.phone)) {
    return { error: "Vnesi veljavno telefonsko številko (npr. 040 123 456)." };
  }
  // Neobvezno polje - isti vzorec kot email v bookAppointment zgoraj.
  const email = input.email?.trim() || null;
  if (email && !isValidEmail(email)) {
    return { error: "Email naslov ni veljaven (ali pusti polje prazno)." };
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

  let { error } = await supabase.from("waitlist").insert({
    salon_id: salonId,
    customer_name: input.name,
    customer_phone: input.phone,
    customer_email: email,
    preferred_date: input.date,
    service_preference: input.service,
    ip_address: ip,
  });

  // Prehodna varovalka: dokler waitlist.customer_email migracija morda še ni
  // zagnana (isti KRITIČEN vzorec kot appointments.token prej v tej datoteki
  // - glej pogovor s Claude o produkcijski napaki, ko je manjkajoč stolpec
  // blokiral VSAKO rezervacijo) - brez tega bi manjkajoč stolpec blokiral
  // VSAK vpis na čakalno listo, ne samo shranjevanje e-pošte.
  if (error?.code === "42703") {
    console.error(
      `[${slug}] waitlist.customer_email še ne obstaja (manjkajoča migracija) - vpisujem brez njega.`
    );
    const fallback = await supabase.from("waitlist").insert({
      salon_id: salonId,
      customer_name: input.name,
      customer_phone: input.phone,
      preferred_date: input.date,
      service_preference: input.service,
      ip_address: ip,
    });
    error = fallback.error;
  }

  if (error) {
    return { error: error.message };
  }

  return {};
}
