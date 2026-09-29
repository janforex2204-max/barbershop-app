"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { defaultHours } from "@/lib/default-hours";
import type { SalonDayHours } from "@/types/database.types";

// Isti vzorec kot resolveApprovedSalonId v ./services-actions.ts - salon_id
// NAMENOMA razrešimo tu, s strežniške seje klicatelja, nikoli iz podatkov,
// ki bi jih poslal klient.
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

export async function addEmployee(formData: FormData) {
  const supabase = await createClient();
  const salonId = await resolveApprovedSalonId(supabase);

  if (!salonId) {
    redirect(`/owner/employees?error=${encodeURIComponent("Seja je potekla. Prijavi se znova.")}`);
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(`/owner/employees?error=${encodeURIComponent("Vnesi ime zaposlenega.")}`);
  }

  // Nov zaposleni podeduje TRENUTNI urnik salona (ne živo povezavo) - boljši
  // privzetek kot prazen urnik, lastnik ga nato prilagodi spodaj. Zaščita
  // pred starim {legacy_text: ...} zapisom nekaterih salonov (glej
  // supabase/schema.sql) - brez nje bi nov zaposleni podedoval pokvarjeno
  // vrednost namesto veljavnega urnika.
  const { data: ownerRow } = await supabase
    .from("salon_owners")
    .select("hours")
    .eq("id", salonId)
    .maybeSingle();
  const seedHours: SalonDayHours[] =
    Array.isArray(ownerRow?.hours) && ownerRow.hours.length > 0 ? ownerRow.hours : defaultHours();

  const { count } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("salon_id", salonId);

  const { error } = await supabase.from("employees").insert({
    salon_id: salonId,
    name,
    hours: seedHours,
    sort_order: (count ?? 0) + 1,
    // Isti vzorec kot appointments.token ([slug]/actions.ts) - avtorizacija
    // za /moj-urnik/[token] (glej supabase/schema.sql).
    schedule_token: randomBytes(32).toString("hex"),
  });

  if (error) {
    redirect(`/owner/employees?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/owner/employees");
  revalidatePath("/owner");
}

// Ime + aktiven/neaktiven - bare update, RLS (employees_owner_manage:
// salon_id = my_salon_id()) sama poskrbi za mejo lastništva (isti vzorec kot
// updateService v ./services-actions.ts). NAMENOMA brez deleteEmployee -
// zaposleni je pravi FK cilj (appointments.employee_id), deaktivacija je
// edina V1 potrebna akcija in podpira sezonski scenarij (najem samo za
// poletje, jeseni deaktivacija, zgodovina rezervacij ostane nedotaknjena).
export async function updateEmployee(employeeId: string, formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const active = formData.get("active") === "on";

  if (!name) {
    redirect(`/owner/employees?error=${encodeURIComponent("Ime zaposlenega ne sme biti prazno.")}`);
  }

  const { error } = await supabase.from("employees").update({ name, active }).eq("id", employeeId);

  if (error) {
    redirect(`/owner/employees?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/owner/employees");
  revalidatePath("/owner");
}

// Klicano direktno kot async funkcija (ne prek FormData) - mirror
// updateSalonHours v ./actions.ts, samo brez admin klienta: za razliko od
// salon_owners nima employees_owner_manage RLS politika nobene vrzeli za
// self-update, zato navaden session-scoped klient zadostuje.
export async function updateEmployeeHours(
  employeeId: string,
  hours: SalonDayHours[]
): Promise<{ error?: string }> {
  const supabase = await createClient();

  // Server Action je dosegljiv z neposrednim POST-om mimo UI-ja, zato se ne
  // zanašamo samo na obliko, ki jo DayHoursEditor sicer vedno pošlje.
  if (!Array.isArray(hours) || hours.length === 0) {
    return { error: "Neveljaven urnik." };
  }
  for (const day of hours) {
    if (typeof day?.day !== "string" || typeof day?.closed !== "boolean") {
      return { error: "Neveljaven urnik." };
    }
  }

  const { error } = await supabase.from("employees").update({ hours }).eq("id", employeeId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/owner/employees");
  return {};
}

const MAX_PHOTO_SIZE_BYTES = 2 * 1024 * 1024;
const PHOTO_EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

// Isti vzorec kot uploadSalonLogo v ./actions.ts (glej opombo tam in
// "employee-photos" bucket v supabase/schema.sql) - session-scoped klient tu
// preveri DVOJE (seja + da employeeId dejansko pripada TEMU salonu, ne le da
// zaposleni nekje obstaja - brez tega bi lastnik lahko s prirejenim
// employeeId prepisal sliko zaposlenega drugega salona), dejanski zapis
// (Storage + employees.photo_url) pa naredi admin klient.
export async function uploadEmployeePhoto(
  employeeId: string,
  formData: FormData
): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const salonId = await resolveApprovedSalonId(supabase);
  if (!salonId) {
    return { error: "Seja je potekla. Prijavi se znova." };
  }

  const { data: employeeRow } = await supabase
    .from("employees")
    .select("id")
    .eq("id", employeeId)
    .eq("salon_id", salonId)
    .maybeSingle();
  if (!employeeRow) {
    return { error: "Zaposleni ne obstaja." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Datoteka manjka." };
  }

  const ext = PHOTO_EXT_BY_TYPE[file.type];
  if (!ext) {
    return { error: "Dovoljeni formati: PNG, JPEG ali WebP." };
  }
  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    return { error: "Datoteka je prevelika (največ 2 MB)." };
  }

  const admin = createAdminClient();
  // "<employee_id>.<ext>" (ne izvirno ime datoteke) + upsert - vedno ISTA
  // pot za TEGA zaposlenega, zato nova nalaganja preprosto prepišejo prejšnjo.
  const path = `${salonId}/${employeeId}.${ext}`;
  const { error: uploadError } = await admin.storage
    .from("employee-photos")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) {
    return { error: uploadError.message };
  }

  const { data } = admin.storage.from("employee-photos").getPublicUrl(path);
  // Cache-bust - pot je zaradi upsert vedno ista, brez tega bi brskalnik
  // (ali CDN) po zamenjavi slike lahko še vedno prikazoval STARO.
  const publicUrl = `${data.publicUrl}?v=${Date.now()}`;

  const { error: dbError } = await admin
    .from("employees")
    .update({ photo_url: publicUrl })
    .eq("id", employeeId);
  if (dbError) {
    return { error: dbError.message };
  }

  revalidatePath("/owner/employees");
  return { url: publicUrl };
}

// "Ustvari nov link" na /owner/employees - PREPIŠE schedule_token, s čimer
// stari /moj-urnik/[token] link takoj preneha delovati (unique index v
// schema.sql, [token] stran bere admin klient prek TOČNO te vrednosti,
// glej pogovor s Claude). Isti RLS-only vzorec kot updateEmployee/
// updateEmployeeHours zgoraj (employees_owner_manage: salon_id =
// my_salon_id() že sam poskrbi za mejo lastništva) - za razliko od
// uploadEmployeePhoto tu ni Storage zapisa, ki bi zahteval admin klienta.
export async function regenerateEmployeeScheduleToken(
  employeeId: string
): Promise<{ token?: string; error?: string }> {
  const supabase = await createClient();
  const token = randomBytes(32).toString("hex");

  const { error } = await supabase
    .from("employees")
    .update({ schedule_token: token })
    .eq("id", employeeId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/owner/employees");
  return { token };
}
