import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLATFORM_NAME } from "@/lib/constants";

// Odobritev lastnika z enim klikom iz admin email obvestila - namenoma BREZ
// zahteve po prijavi (klika se iz emaila, ne iz brskalnika, kjer je lastnik
// prijavljen). Varnost temelji izključno na tem, da je `token` 256-bitno
// naključno geslo, ki ga ni mogoče uganiti - glej razlago v pogovoru s Claude.
// Zato tu namerno uporabimo admin (service_role) klienta, ki obide RLS:
// sam token JE avtorizacija, dodatna prijava ni potrebna niti smiselna.
export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token");

  if (!token) {
    return page("Napaka", "Manjka token za odobritev.", false);
  }

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("salon_owners")
    .select("id, salon_name, approved_at")
    .eq("approval_token", token)
    .maybeSingle();

  if (error || !row) {
    return page("Napaka", "Povezava za odobritev ni veljavna.", false);
  }

  if (row.approved_at) {
    return page(
      "Napaka",
      `Ta povezava je bila že uporabljena - salon "${row.salon_name}" je bil že odobren.`,
      false
    );
  }

  const { error: updateError } = await admin
    .from("salon_owners")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", row.id);

  if (updateError) {
    return page("Napaka", `Odobritev ni uspela: ${updateError.message}`, false);
  }

  return page("Odobreno", `Salon "${row.salon_name}" je odobren.`, true);
}

function page(title: string, message: string, ok: boolean) {
  const html = `<!doctype html>
<html lang="sl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — ${PLATFORM_NAME}</title>
  <style>
    body { background: #1b1815; color: #efe6d8; font-family: system-ui, sans-serif;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; padding: 16px; box-sizing: border-box; }
    .card { max-width: 380px; width: 100%; border: 1px solid #3a342c; border-radius: 8px;
            padding: 28px 24px; text-align: center; }
    .brand { color: #a67c3d; font-size: 15px; margin: 0 0 12px; }
    h1 { font-size: 18px; margin: 0 0 10px; }
    p { font-size: 14px; margin: 0; color: ${ok ? "#7fa06b" : "#c97d7d"}; }
  </style>
</head>
<body>
  <div class="card">
    <p class="brand">${PLATFORM_NAME}</p>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
