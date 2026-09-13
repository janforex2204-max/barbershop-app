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

  const { data: salon } = await supabase
    .from("public_salons")
    .select("id, salon_name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!salon) {
    notFound();
  }

  return <BookingPage slug={slug} salonId={salon.id} salonName={salon.salon_name} />;
}
