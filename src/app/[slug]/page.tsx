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

  let { data: salon, error } = await supabase
    .from("public_salons")
    .select("id, salon_name, slug, hours, category")
    .eq("slug", slug)
    .maybeSingle();

  // Prehodna varovalka: dokler public_salons view morda še ni osvežen z
  // `hours`/`category` stolpcema (supabase/schema.sql migracija poslana, a
  // morda še ni zagnana - isti dejansko že videni vzorec kot pri
  // services.price, glej pogovor s Claude), NE sme celotna stran pasti v
  // napako samo zato, ker manjkata delovni čas/tema - poskusi še enkrat
  // brez njiju (resolveDayWindow hours=null uporabi privzet delovni čas,
  // resolveSalonTheme category=null uporabi privzeto temo - oboje ne kot
  // napako).
  if (error?.code === "42703") {
    console.error(
      `[${slug}] public_salons.hours/category še ne obstajata (manjkajoča migracija) - nadaljujem s privzetim delovnim časom/temo.`
    );
    const fallback = await supabase
      .from("public_salons")
      .select("id, salon_name, slug")
      .eq("slug", slug)
      .maybeSingle();
    salon = fallback.data ? { ...fallback.data, hours: null, category: null } : null;
    error = fallback.error;
  }

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

  return (
    <BookingPage
      slug={slug}
      salonId={salon.id}
      salonName={salon.salon_name}
      salonHours={salon.hours}
      salonCategory={salon.category}
    />
  );
}
