"use server";

import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isValidCustomerName, isValidPhone } from "@/lib/constants";

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
async function resolveSalonId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slug: string
): Promise<{ salonId: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from("public_salons")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error(`[${slug}] Napaka pri razreševanju salona:`, error.message);
    return { salonId: null, error: "Prišlo je do začasne napake. Poskusi znova čez trenutek." };
  }
  if (!data) {
    return { salonId: null, error: "Salon ne obstaja." };
  }
  return { salonId: data.id, error: null };
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
  const { salonId, error: resolveError } = await resolveSalonId(supabase, slug);

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

  const { error } = await supabase.from("appointments").insert({
    salon_id: salonId,
    customer_name: input.name,
    customer_phone: input.phone,
    service: input.service,
    appointment_date: input.date,
    appointment_time: input.time,
    status: "booked",
    ip_address: ip,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Ta termin je bil pravkar zaseden. Izberi drugega." };
    }
    return { error: error.message };
  }

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
