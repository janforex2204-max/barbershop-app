"use server";

import { createClient } from "@/lib/supabase/server";

// KRITIČNO: salon_id se za VSAK klic izpelje TUKAJ, na strežniku, iz `slug`
// prek public_salons (samo odobreni saloni) - nikoli se ne sprejme salon_id,
// ki bi ga (ne glede na to od kod) poslal klient. Tudi če klient pošlje
// popolnoma poljuben `slug`, dobi kvečjemu rezervacijo PRI TISTEM salonu -
// nikoli ne more "podtakniti" tuje salon_id vrednosti drugam.
async function resolveSalonId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slug: string
): Promise<string | null> {
  const { data } = await supabase
    .from("public_salons")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return data?.id ?? null;
}

export async function bookAppointment(
  slug: string,
  input: { name: string; phone: string; service: string; date: string; time: string }
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const salonId = await resolveSalonId(supabase, slug);

  if (!salonId) {
    return { error: "Salon ne obstaja." };
  }

  const { error } = await supabase.from("appointments").insert({
    salon_id: salonId,
    customer_name: input.name,
    customer_phone: input.phone,
    service: input.service,
    appointment_date: input.date,
    appointment_time: input.time,
    status: "booked",
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
  const supabase = await createClient();
  const salonId = await resolveSalonId(supabase, slug);

  if (!salonId) {
    return { error: "Salon ne obstaja." };
  }

  const { error } = await supabase.from("waitlist").insert({
    salon_id: salonId,
    customer_name: input.name,
    customer_phone: input.phone,
    preferred_date: input.date,
    service_preference: input.service,
  });

  if (error) {
    return { error: error.message };
  }

  return {};
}
