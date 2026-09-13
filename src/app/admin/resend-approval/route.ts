import { type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewRegistration } from "@/lib/email";
import { adminPage } from "@/lib/admin-page";

// Ročno sprožen endpoint (obišči povezavo v brskalniku ali curl), ko
// prvotna odobritvena povezava poteče (glej APPROVAL_TOKEN_EXPIRY_DAYS),
// preden je bila uporabljena. Generira nov approval_token in ponovno
// pošlje admin email s svežo povezavo. Brez prijave, iz istega razloga kot
// /admin/approve - obseg zlorabe je omejen na ponovno pošiljanje ENAKEGA
// admin obvestila na tvoj lasten, fiksen OWNER_NOTIFICATION_EMAIL naslov,
// nikoli nikamor drugam, zato odsotnost prijave tu ni varnostna luknja.
export async function GET(request: NextRequest) {
  const email = new URL(request.url).searchParams.get("email")?.trim();

  if (!email) {
    return adminPage(
      "Napaka",
      "Manjka ?email=<email registranta> v URL-ju.",
      false
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // salon_owners nima stolpca email (samo user_id) - poišči auth uporabnika
  // po e-pošti prek Supabase admin REST API-ja.
  const usersRes = await fetch(
    `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    }
  );
  const usersBody = await usersRes.json();
  const authUser = usersBody?.users?.[0];

  if (!usersRes.ok || !authUser) {
    return adminPage("Napaka", `Ni uporabnika z e-pošto "${email}".`, false);
  }

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("salon_owners")
    .select("id, salon_name, status")
    .eq("user_id", authUser.id)
    .maybeSingle();

  if (error || !row) {
    return adminPage(
      "Napaka",
      "Ni najdene registracije salona za tega uporabnika.",
      false
    );
  }

  if (row.status === "approved") {
    return adminPage(
      "Ni potrebno",
      `Salon "${row.salon_name}" je že odobren - novega emaila ni treba pošiljati.`,
      true
    );
  }

  const newToken = randomBytes(32).toString("hex");
  const { error: updateError } = await admin
    .from("salon_owners")
    .update({
      approval_token: newToken,
      approval_token_created_at: new Date().toISOString(),
      approved_at: null,
    })
    .eq("id", row.id);

  if (updateError) {
    return adminPage(
      "Napaka",
      `Osvežitev tokena ni uspela: ${updateError.message}`,
      false
    );
  }

  try {
    await notifyNewRegistration({
      email,
      salonName: row.salon_name,
      approvalToken: newToken,
    });
  } catch (e) {
    return adminPage(
      "Napaka",
      `Token je bil osvežen, a pošiljanje emaila ni uspelo: ${
        e instanceof Error ? e.message : String(e)
      }`,
      false
    );
  }

  return adminPage(
    "Poslano",
    `Nov odobritveni email je bil poslan za salon "${row.salon_name}".`,
    true
  );
}
