"use server";

import { redirect } from "next/navigation";
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

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error || !data.user) {
    redirect(
      `/register?error=${encodeURIComponent(
        error?.message ?? "Napaka pri registraciji."
      )}`
    );
  }

  // Vstavi prek admin (service_role) klienta - takoj po signUp morda še ni
  // aktivne seje (npr. če projekt zahteva potrditev e-pošte), zato se na
  // navadni RLS-zaščiteni insert ne moremo zanesti.
  const admin = createAdminClient();
  const { error: insertError } = await admin.from("salon_owners").insert({
    user_id: data.user.id,
    salon_name: salonName,
    status: "pending",
  });

  if (insertError) {
    redirect(`/register?error=${encodeURIComponent(insertError.message)}`);
  }

  try {
    await notifyNewRegistration({ email, salonName });
  } catch (e) {
    console.error("Napaka pri pošiljanju email obvestila:", e);
  }

  redirect("/register/success");
}
