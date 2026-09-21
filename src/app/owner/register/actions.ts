"use server";

import { headers } from "next/headers";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewRegistration } from "@/lib/email";
import { generateUniqueSlug } from "@/lib/slug";
import { translateAuthError } from "@/lib/auth-errors";
import { PLATFORM_URL } from "@/lib/constants";
import type { SalonDayHours } from "@/types/database.types";

type ServiceTemplate = { name: string; durationMinutes: number };

// Vsak nov salon dobi privzet seznam storitev (ime + trajanje), da ima
// rezervacijski obrazec in cenik (/owner/services) takoj kaj za pokazati -
// lastnik jih lahko kasneje poljubno ureja/briše/dodaja. Ključi so TOČNO
// podkategorije iz SUBTYPES v page.tsx (Korak 1) - če se tam kaj preimenuje,
// je treba uskladiti tudi tu. Trajanja so groba, splošna ocena za slovenski
// trg, ne nekaj, kar je lastnik sam potrdil - zato jih lahko po registraciji
// prosto spremeni na /owner/services.
const SERVICE_TEMPLATES: Record<string, ServiceTemplate[]> = {
  Barbershop: [
    { name: "Strižba", durationMinutes: 30 },
    { name: "Strižba in brada", durationMinutes: 45 },
    { name: "Britje z britvico", durationMinutes: 30 },
  ],
  "Ženski frizerski salon": [
    { name: "Strižba in styling", durationMinutes: 60 },
    { name: "Barvanje", durationMinutes: 90 },
    { name: "Pramenčki", durationMinutes: 120 },
  ],
  "Univerzalni salon": [
    { name: "Moška strižba", durationMinutes: 30 },
    { name: "Ženska strižba", durationMinutes: 60 },
    { name: "Barvanje", durationMinutes: 90 },
  ],
  "Nohtni studio": [
    { name: "Manikura", durationMinutes: 45 },
    { name: "Pedikura", durationMinutes: 60 },
    { name: "Gel nohti", durationMinutes: 75 },
  ],
  Ličenje: [
    { name: "Dnevno ličenje", durationMinutes: 45 },
    { name: "Večerno ličenje", durationMinutes: 60 },
    { name: "Poročno ličenje", durationMinutes: 90 },
  ],
  "Nega obraza in telesa": [
    { name: "Nega obraza", durationMinutes: 60 },
    { name: "Masaža", durationMinutes: 60 },
    { name: "Depilacija", durationMinutes: 30 },
  ],
};

// Uporabljeno, kadar subtype ne ustreza nobeni znani predlogi zgoraj (izbrana
// "Nekaj drugega"/"+ Dodaj svojo storitev" s prosto besedilo, ali subtype
// manjka) - isto kot prej, samo z dodanim trajanjem.
const FALLBACK_SERVICES: ServiceTemplate[] = [{ name: "Prva storitev", durationMinutes: 30 }];

function defaultServicesFor(subtype: string | null): ServiceTemplate[] {
  if (subtype && SERVICE_TEMPLATES[subtype]) return SERVICE_TEMPLATES[subtype];
  return FALLBACK_SERVICES;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Glej isto funkcijo (in izvirno obrazložitev) v git zgodovini prejšnjega
// src/app/register/actions.ts - logika je nespremenjena, samo premaknjena
// sem skupaj s celotnim registracijskim flowom.
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
    if (error) lastError = error.message;
    await sleep(delayMs);
  }
  return { ok: false, lastError };
}

export type RegisterOwnerState = {
  error?: string;
};

// Nasledi prejšnji /register (en sam obrazec) - isti signUp + salon_owners
// insert + email obvestilo flow, razširjen s category/subtype/address/hours
// iz 4-koračnega wizarda (glej page.tsx). Klican NEPOSREDNO iz klientske
// wizard komponente (ne kot <form action>), zato tu NAMENOMA vračamo
// { error } namesto redirect() na vsako napako - redirect bi ponastavil ves
// izpolnjeni wizard nazaj na korak 1 in izbrisal, kar je uporabnik že vnesel.
// Uspeh prav tako vrne prazen objekt - page.tsx sam preklopi na korak 4 (že
// ima vse podatke za prikaz v lokalnem stanju).
export async function registerOwner(formData: FormData): Promise<RegisterOwnerState> {
  try {
    return await doRegisterOwner(formData);
  } catch (e) {
    // Varovalka proti KATERIKOLI nepričakovani izjemi spodaj (npr. omrežna
    // napaka na Supabase klicu) - brez tega bi neujeta izjema v Server
    // Actionu na klientu pristala kot neujeta zavrnitev, ki je (odvisno od
    // tega, kje natanko pade) znala povzročiti remount RegisterPage in s tem
    // tiho ponastavitev celotnega wizarda na korak 1 (glej handleSubmit v
    // page.tsx - tudi ta ima zdaj svoj try/catch kot drugo linijo obrambe).
    console.error("[owner/register] Nepričakovana napaka:", e);
    return { error: "Prišlo je do nepričakovane napake. Poskusi znova." };
  }
}

async function doRegisterOwner(formData: FormData): Promise<RegisterOwnerState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const salonName = String(formData.get("salon_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const whatsappConsent = formData.get("whatsapp_consent") === "true";
  const category = String(formData.get("category") ?? "").trim() || null;
  const subtype = String(formData.get("subtype") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;

  // Poslano kot JSON string (glej page.tsx handleSubmit) - salon_owners.hours
  // je jsonb, zato tu razparsan objekt/array pošljemo naprej takšnega, kot
  // je (supabase-js ga sam serializira), NE nazaj kot string.
  let hours: SalonDayHours[] | null = null;
  const hoursRaw = formData.get("hours");
  if (typeof hoursRaw === "string" && hoursRaw.trim()) {
    try {
      const parsed = JSON.parse(hoursRaw);
      if (Array.isArray(parsed)) hours = parsed;
    } catch {
      hours = null;
    }
  }

  if (!email || !password || !salonName || !phone) {
    return { error: "Izpolni vsa polja." };
  }
  if (password.length < 8) {
    return { error: "Geslo mora imeti vsaj 8 znakov." };
  }
  if (!whatsappConsent) {
    return {
      error:
        "Za dokončanje registracije se moraš strinjati z uporabo telefonske številke za WhatsApp obveščanje.",
    };
  }

  // Glej razlago v git zgodovini prejšnjega src/app/register/actions.ts -
  // NAMENOMA hardkodiran PLATFORM_URL (fillio.si), ne request-ov `origin`,
  // razen na localhostu med razvojem.
  const headersList = await headers();
  const origin = headersList.get("origin") ?? "";
  const isLocalOrigin =
    origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1");
  const redirectOrigin = isLocalOrigin ? origin : PLATFORM_URL;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${redirectOrigin}/auth/confirm` },
  });

  console.log(
    `[owner/register] signUp za ${email}: error=${error?.message ?? "null"}, user.id=${data.user?.id ?? "null"}, identities=${data.user?.identities?.length ?? "null"}`
  );

  if (error || !data.user) {
    return { error: translateAuthError(error?.message, "Napaka pri registraciji.") };
  }

  // Supabase signUp() za e-mail, ki JE ŽE registriran, iz varnostnih razlogov
  // (proti ugibanju obstoječih računov) NE vrne napake - tiho vrne isti
  // OBSTOJEČI user.id z identities: [] (prazen array - pri resnično novem
  // uporabniku ima vedno vsaj en element). To je edini zanesljiv signal za
  // ta primer; brez tega preverjanja bi tok šel naprej in kasneje padel na
  // salon_owners.user_id unique omejitvi (23505 spodaj), kar je bilo prej
  // NAROBE obravnavano kot tihi uspeh za VSAK 23505, ne samo za dvojni klik
  // iste seje.
  if (data.user.identities && data.user.identities.length === 0) {
    return { error: "Uporabnik s tem e-poštnim naslovom je že registriran." };
  }

  // 32 bajtov (256 bit) naključnosti - glej src/app/admin/approve/route.ts.
  const approvalToken = randomBytes(32).toString("hex");
  const admin = createAdminClient();

  const authCheck = await waitForAuthUser(admin, data.user.id);
  if (!authCheck.ok) {
    console.error(
      `[owner/register] waitForAuthUser ni uspel za user.id=${data.user.id}, zadnja napaka:`,
      authCheck.lastError
    );
    return {
      error: translateAuthError(
        authCheck.lastError,
        "Prišlo je do začasne napake pri ustvarjanju računa. Poskusi znova čez trenutek."
      ),
    };
  }

  const slug = await generateUniqueSlug(admin, salonName);

  let salon: { id: string } | null = null;
  let insertError: { code?: string; message: string } | null = null;

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
        category,
        subtype,
        address,
        hours,
      })
      .select("id")
      .single();

    salon = inserted;
    insertError = error;

    if (!error || error.code !== "23503") break;
    await sleep(400);
  }

  if (insertError?.code === "23505") {
    // salon_owners.user_id je "unique" - isti e-mail je že prej uspešno
    // opravil signUp+insert (dvojni klik, ponovna oddaja ...). Obravnavamo
    // kot uspeh, glej opombo v prejšnjem /register/actions.ts.
    return {};
  }

  if (insertError?.code === "23503") {
    console.error(
      `[owner/register] insert v salon_owners 3x zapored padel na 23503 za user.id=${data.user.id}`
    );
    return {
      error: "Prišlo je do začasne napake pri ustvarjanju računa. Poskusi znova čez trenutek.",
    };
  }

  if (insertError || !salon) {
    return { error: insertError?.message ?? "Napaka pri registraciji." };
  }

  const { error: servicesError } = await admin.from("services").insert(
    defaultServicesFor(subtype).map((s, i) => ({
      salon_id: salon.id,
      name: s.name,
      duration_minutes: s.durationMinutes,
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

  return {};
}
