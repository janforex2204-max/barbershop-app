import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { APPROVAL_TOKEN_EXPIRY_DAYS } from "@/lib/constants";
import { adminPage } from "@/lib/admin-page";

// Odobritev lastnika z enim klikom iz admin email obvestila - namenoma BREZ
// zahteve po prijavi (klika se iz emaila, ne iz brskalnika, kjer je lastnik
// prijavljen). Varnost temelji izključno na tem, da je `token` 256-bitno
// naključno geslo, ki ga ni mogoče uganiti - glej razlago v pogovoru s Claude.
// Zato tu namerno uporabimo admin (service_role) klienta, ki obide RLS:
// sam token JE avtorizacija, dodatna prijava ni potrebna niti smiselna.
export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token");

  if (!token) {
    return adminPage("Napaka", "Manjka token za odobritev.", false);
  }

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("salon_owners")
    .select("id, salon_name, approved_at, approval_token_created_at, created_at")
    .eq("approval_token", token)
    .maybeSingle();

  if (error || !row) {
    return adminPage("Napaka", "Povezava za odobritev ni veljavna.", false);
  }

  if (row.approved_at) {
    return adminPage(
      "Napaka",
      `Ta povezava je bila že uporabljena - salon "${row.salon_name}" je bil že odobren.`,
      false
    );
  }

  // approval_token_created_at sledi, kdaj je bil TA KONKRETNI token izdan
  // (ponovno pošiljanje ga osveži) - ločeno od created_at, ki je datum
  // registracije in se ne spreminja.
  const tokenIssuedAt = row.approval_token_created_at ?? row.created_at;
  const ageMs = Date.now() - new Date(tokenIssuedAt).getTime();
  const expiryMs = APPROVAL_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  if (ageMs > expiryMs) {
    return adminPage(
      "Napaka",
      `Ta povezava je potekla (veljavna je bila ${APPROVAL_TOKEN_EXPIRY_DAYS} dni). Za nov odobritveni email obišči /admin/resend-approval?email=<email registranta>.`,
      false
    );
  }

  const { error: updateError } = await admin
    .from("salon_owners")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", row.id);

  if (updateError) {
    return adminPage("Napaka", `Odobritev ni uspela: ${updateError.message}`, false);
  }

  return adminPage("Odobreno", `Salon "${row.salon_name}" je odobren.`, true);
}
