"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewRegistration } from "@/lib/email";

export async function registerOwner(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const salonName = String(formData.get("salon_name") ?? "").trim();

  if (!email || !password || !salonName) {
    redirect(`/register?error=${encodeURIComponent("Izpolni vsa polja.")}`);
  }
  if (password.length < 6) {
    redirect(
      `/register?error=${encodeURIComponent("Geslo mora imeti vsaj 6 znakov.")}`
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

  // Vstavi prek admin (service_role) klienta - takoj po signUp morda še ni
  // aktivne seje (npr. če projekt zahteva potrditev e-pošte), zato se na
  // navadni RLS-zaščiteni insert ne moremo zanesti.
  const admin = createAdminClient();
  const { error: insertError } = await admin.from("salon_owners").insert({
    user_id: data.user.id,
    salon_name: salonName,
    status: "pending",
    approval_token: approvalToken,
  });

  if (insertError) {
    redirect(`/register?error=${encodeURIComponent(insertError.message)}`);
  }

  try {
    await notifyNewRegistration({ email, salonName, approvalToken });
  } catch (e) {
    console.error("Napaka pri pošiljanju email obvestila:", e);
  }

  redirect(`/register/success?salon=${encodeURIComponent(salonName)}`);
}
