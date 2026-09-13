import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BookingPage from "./booking-page";

// Razreši /[slug] -> salon (samo odobreni, prek javnega public_salons view-a
// - glej supabase/schema.sql). Neobstoječ ali neodobren slug pravilno vrne
// standardno Next.js 404 stran, brez izpostavitve KATERIKOLI informacije o
// tem, ali slug morda obstaja v stanju "pending"/"rejected".
export default async function SalonBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: salon, error } = await supabase
    .from("public_salons")
    .select("id, salon_name, slug")
    .eq("slug", slug)
    .maybeSingle();

  // Ločimo "slug res ne obstaja" (notFound - prava 404) od "poizvedba je
  // spodletela" (napaka - npr. začasna PostgREST schema-cache napaka tik po
  // migraciji, ali omrežna težava). Prej se je `error` tiho zavrgel in VSAKA
  // napaka je izpadla kot 404 "salon ne obstaja", čeprav salon dejansko
  // obstaja - to je vrglo poizvedbo v error.tsx, ki ponudi pravi "poskusi
  // znova" namesto zavajajoče trajne 404 strani.
  if (error) {
    console.error(`[${slug}] Napaka pri razreševanju salona (stran):`, error.message);
    throw new Error("Napaka pri nalaganju salona.");
  }

  if (!salon) {
    notFound();
  }

  return <BookingPage slug={slug} salonId={salon.id} salonName={salon.salon_name} />;
}
