"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Isti vzorec kot addManualAppointment v ./actions.ts - salon_id NAMENOMA
// razrešimo tu, s strežniške seje klicatelja, nikoli iz podatkov, ki bi jih
// poslal klient.
async function resolveApprovedSalonId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: ownerRow } = await supabase
    .from("salon_owners")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();

  return ownerRow?.id ?? null;
}

// Prazno polje -> null ("cena ni nastavljena"). Sprejme tudi vejico kot
// decimalno ločilo (slovenska tipkovnica jo lahko vnese v number input kljub
// pričakovani piki) - NaN se vrne za dejansko neveljaven vnos in se obravnava
// kot napaka klicatelja spodaj.
function parsePriceInput(raw: FormDataEntryValue | null): number | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  return Number(trimmed.replace(",", "."));
}

function invalidPriceMessage(price: number | null): string | null {
  if (price !== null && (Number.isNaN(price) || price < 0)) {
    return "Cena mora biti veljavno, nenegativno število (ali prazno, če je še nimaš).";
  }
  return null;
}

export async function updateService(serviceId: string, formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const price = parsePriceInput(formData.get("price"));
  const active = formData.get("active") === "on";

  if (!name) {
    redirect(`/owner/services?error=${encodeURIComponent("Ime storitve ne sme biti prazno.")}`);
  }
  const priceError = invalidPriceMessage(price);
  if (priceError) {
    redirect(`/owner/services?error=${encodeURIComponent(priceError)}`);
  }

  // RLS (services_owner_manage: salon_id = my_salon_id()) že sama poskrbi,
  // da to lahko spremeni SAMO lastnik salona, ki mu storitev pripada -
  // eksplicitnega preverjanja tu ni treba dodajati (isti vzorec kot
  // cancelAppointment/markSmsSent v ./actions.ts).
  const { error } = await supabase
    .from("services")
    .update({ name, price, active })
    .eq("id", serviceId);

  if (error) {
    redirect(`/owner/services?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/owner/services");
  revalidatePath("/owner");
}

export async function addService(formData: FormData) {
  const supabase = await createClient();
  const salonId = await resolveApprovedSalonId(supabase);

  if (!salonId) {
    redirect(`/owner/services?error=${encodeURIComponent("Seja je potekla. Prijavi se znova.")}`);
  }

  const name = String(formData.get("name") ?? "").trim();
  const price = parsePriceInput(formData.get("price"));

  if (!name) {
    redirect(`/owner/services?error=${encodeURIComponent("Vnesi ime storitve.")}`);
  }
  const priceError = invalidPriceMessage(price);
  if (priceError) {
    redirect(`/owner/services?error=${encodeURIComponent(priceError)}`);
  }

  const { count } = await supabase
    .from("services")
    .select("id", { count: "exact", head: true })
    .eq("salon_id", salonId);

  const { error } = await supabase.from("services").insert({
    salon_id: salonId,
    name,
    price,
    sort_order: (count ?? 0) + 1,
  });

  if (error) {
    redirect(`/owner/services?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/owner/services");
  revalidatePath("/owner");
}

// Varno brisanje brez osirotelih referenc: appointments.service je prosto
// besedilo (ne tuji ključ na services.id, glej supabase/schema.sql), zato
// izbris storitve ne vpliva na že obstoječe rezervacije.
export async function deleteService(serviceId: string) {
  const supabase = await createClient();
  await supabase.from("services").delete().eq("id", serviceId);
  revalidatePath("/owner/services");
  revalidatePath("/owner");
}
