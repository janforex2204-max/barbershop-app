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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Dokazano v produkciji (uporabnik je dejansko dobil "violates foreign key
// constraint salon_owners_user_id_fkey" takoj po registraciji): kljub temu,
// da je auth.users v ISTI Postgres bazi kot salon_owners (nobene ločene
// replike, ki bi lahko "zamujala"), se OBČASNO zgodi, da salon_owners insert
// (prek admin/PostgREST poti) še ne vidi vrstice, ki jo je signUp() (prek
// GoTrue/auth poti) pravkar vrnil kot uspešno ustvarjeno - najverjetneje gre
// za to, da GoTrue odgovor vrne, PREDEN je pošiljanje potrditvenega emaila
// (ki je del istega zahtevka) v celoti zaključeno, kar odgovor lahko zakasni
// glede na dejanski commit. To PREVERI neposredno prek admin auth API-ja
// (getUserById, ki gre direktno na GoTrue, mimo PostgREST-a) in počaka s
// kratkimi poskusi, namesto da bi ugibali - veliko zanesljivejše kot samo
// "počakaj X ms in upaj".
async function waitForAuthUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  maxAttempts = 5,
  delayMs = 400
): Promise<{ ok: boolean; lastError: string | null }> {
  let lastError: string | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (!error && data.user) return { ok: true, lastError: null };
    // Ločimo "uporabnika (še) ni" (error==null, data.user==null - pravi
    // primer za čakanje) od DEJANSKE napake klica (npr. neveljaven/napačen
    // SUPABASE_SERVICE_ROLE_KEY na Vercel - to bi se OBNAŠALO enako kot
    // "ni ga še", a se z čakanjem NIKOLI ne popravi). Zapišemo zadnjo
    // dejansko napako, da jo lahko pokažemo namesto tihega "poskusi znova".
    if (error) lastError = error.message;
    await sleep(delayMs);
  }
  return { ok: false, lastError };
}

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

  // Diagnostično beleženje (Vercel function logs) - da naslednjič, če se kaj
  // od spodaj ponovi, vidimo natančno, kaj je signUp() dejansko vrnil, ne
  // samo končno napako.
  console.log(
    `[register] signUp za ${email}: error=${error?.message ?? "null"}, user.id=${data.user?.id ?? "null"}, identities=${data.user?.identities?.length ?? "null"}`
  );

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

  // Glej waitForAuthUser zgoraj - počakaj, da je auth uporabnik DEJANSKO
  // viden, preden nadaljujemo na insert, ki nanj referencira (salon_owners
  // user_id FK). Če po vseh poskusih še vedno ni viden, ne silimo insert-a v
  // gotov FK zlom - raje jasna napaka, ki jo lahko uporabnik poskusi znova.
  const authCheck = await waitForAuthUser(admin, data.user.id);
  if (!authCheck.ok) {
    console.error(
      `[register] waitForAuthUser ni uspel za user.id=${data.user.id}, zadnja napaka:`,
      authCheck.lastError
    );
    // Diagnostično (začasno): če je bila DEJANSKA napaka (ne samo "uporabnika
    // še ni"), jo pokažemo - najverjetneje gre za nastavitev na Vercel
    // (napačen/manjkajoč SUPABASE_SERVICE_ROLE_KEY), ne za resnično čakanje.
    redirect(
      `/register?error=${encodeURIComponent(
        authCheck.lastError
          ? `Napaka pri preverjanju računa: ${authCheck.lastError}`
          : "Prišlo je do začasne napake pri ustvarjanju računa. Poskusi znova čez trenutek."
      )}`
    );
  }

  const slug = await generateUniqueSlug(admin, salonName);

  let salon: { id: string } | null = null;
  let insertError: { code?: string; message: string } | null = null;

  // Dodatna, ožja varovalka poleg waitForAuthUser - če bi FK napaka (23503)
  // vseeno ušla skozi (npr. drugačna pooler povezava kot getUserById je
  // uporabil), poskusi še dvakrat s kratkim premorom, preden odnehamo.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: inserted, error } = await admin
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

    salon = inserted;
    insertError = error;

    if (!error || error.code !== "23503") break;
    await sleep(400);
  }

  if (insertError?.code === "23505") {
    // salon_owners.user_id je "unique". Do tega pride, ko je isti e-poštni
    // naslov ŽE PREJ uspešno opravil ta isti signUp+insert (npr. uporabnik
    // je poskusil registracijo dvakrat - dvojni klik, ponovno pošiljanje
    // obrazca, vrnitev na stran in ponovna oddaja). Supabase auth.signUp()
    // za NEPOTRJEN obstoječ e-mail (namenoma, proti ugibanju obstoječih
    // računov) tiho vrne isti user.id namesto napake, zato bi brez tega
    // preverjanja uporabnik tu dobil zavajajočo surovo "duplicate key"
    // napako namesto smiselnega sporočila.
    const { data: existing } = await admin
      .from("salon_owners")
      .select("salon_name")
      .eq("user_id", data.user.id)
      .maybeSingle();

    redirect(
      `/register/success?salon=${encodeURIComponent(existing?.salon_name ?? salonName)}`
    );
  }

  if (insertError?.code === "23503") {
    // Vse 3 poskuse zgoraj obrne isti FK zlom - raje jasno, akcijsko
    // sporočilo kot surovo Postgres besedilo ("violates foreign key
    // constraint salon_owners_user_id_fkey"), ki je bilo prej vidno na tem
    // mestu. Zapišemo v log, da vemo, če se to (redko) še dogaja, potem ko
    // je waitForAuthUser zgoraj že preverila, da uporabnik obstaja.
    console.error(
      `[register] insert v salon_owners 3x zapored padel na 23503 za user.id=${data.user.id}`
    );
    redirect(
      `/register?error=${encodeURIComponent(
        "Prišlo je do začasne napake pri ustvarjanju računa. Poskusi znova čez trenutek."
      )}`
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
