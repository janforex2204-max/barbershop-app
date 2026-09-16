"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewRegistration } from "@/lib/email";
import { generateUniqueSlug } from "@/lib/slug";

// Vsak nov salon dobi ta minimalni privzeti seznam storitev, da ima
// rezervacijski obrazec takoj kaj za pokazati - lastnik ga lahko ureja prek
// Supabase Table Editorja, dokler ne obstaja namenski UI za upravljanje
// storitev.
const DEFAULT_SERVICES = ["Prva storitev"];

export async function registerOwner(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const salonName = String(formData.get("salon_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const whatsappConsent = formData.get("whatsapp_consent") === "true";

  if (!email || !password || !salonName || !phone) {
    redirect(`/register?error=${encodeURIComponent("Izpolni vsa polja.")}`);
  }
  if (password.length < 6) {
    redirect(
      `/register?error=${encodeURIComponent("Geslo mora imeti vsaj 6 znakov.")}`
    );
  }
  if (!whatsappConsent) {
    redirect(
      `/register?error=${encodeURIComponent(
        "Za dokončanje registracije se moraš strinjati z uporabo telefonske številke za WhatsApp obveščanje."
      )}`
    );
  }

  // Kam naj potrditveni email preusmeri - eksplicitno, da ne glede na
  // Supabase projekta Site URL nastavitev pravilno pristane na route
  // handlerju, ki sejo vzpostavi in pravilno shrani (glej src/app/auth/confirm).
  const headersList = await headers();
  const origin = headersList.get("origin") ?? "";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });

  if (error || !data.user) {
    redirect(
      `/register?error=${encodeURIComponent(
        error?.message ?? "Napaka pri registraciji."
      )}`
    );
  }

  // 32 bajtov (256 bit) naključnosti - dovolj, da tokena ni mogoče uganiti
  // ali z grobo silo najti (glej razlago varnosti v pogovoru s Claude).
  const approvalToken = randomBytes(32).toString("hex");

  // Vse spodaj prek admin (service_role) klienta - takoj po signUp morda še
  // ni aktivne seje (npr. če projekt zahteva potrditev e-pošte), zato se na
  // navadne RLS-zaščitene poizvedbe ne moremo zanesti.
  const admin = createAdminClient();
  const slug = await generateUniqueSlug(admin, salonName);

  const { data: salon, error: insertError } = await admin
    .from("salon_owners")
    .insert({
      user_id: data.user.id,
      salon_name: salonName,
      slug,
      phone,
      whatsapp_consent: whatsappConsent,
      status: "pending",
      approval_token: approvalToken,
    })
    .select("id")
    .single();

  if (insertError?.code === "23505") {
    // salon_owners.user_id je "unique" - to NI dirkalno stanje (auth.users in
    // salon_owners sta v ISTI Postgres bazi, signUp() zgoraj se vrne šele, ko
    // je auth uporabnik že zapisan/commitan, zato FK vedno vidi pravo
    // vrstico). Do tega pride, ko je isti e-poštni naslov ŽE PREJ uspešno
    // opravil ta isti signUp+insert (npr. uporabnik je poskusil registracijo
    // dvakrat - dvojni klik, ponovno pošiljanje obrazca, vrnitev na stran in
    // ponovna oddaja). Supabase auth.signUp() za NEPOTRJEN obstoječ e-mail
    // (namenoma, proti ugibanju obstoječih računov) tiho vrne isti user.id
    // namesto napake, zato bi brez tega preverjanja uporabnik tu dobil
    // zavajajočo surovo "duplicate key" napako namesto smiselnega sporočila.
    const { data: existing } = await admin
      .from("salon_owners")
      .select("salon_name")
      .eq("user_id", data.user.id)
      .maybeSingle();

    redirect(
      `/register/success?salon=${encodeURIComponent(existing?.salon_name ?? salonName)}`
    );
  }

  if (insertError || !salon) {
    redirect(
      `/register?error=${encodeURIComponent(
        insertError?.message ?? "Napaka pri registraciji."
      )}`
    );
  }

  const { error: servicesError } = await admin.from("services").insert(
    DEFAULT_SERVICES.map((name, i) => ({
      salon_id: salon.id,
      name,
      sort_order: i + 1,
    }))
  );
  if (servicesError) {
    // Ne prekini registracije zaradi tega - lastnik lahko storitve doda
    // ročno prek Table Editorja.
    console.error("Napaka pri dodajanju privzetih storitev:", servicesError);
  }

  try {
    await notifyNewRegistration({ email, salonName, approvalToken });
  } catch (e) {
    console.error("Napaka pri pošiljanju email obvestila:", e);
  }

  redirect(`/register/success?salon=${encodeURIComponent(salonName)}`);
}
