"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
