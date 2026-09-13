import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Cilj povezave za potrditev e-pošte (glej emailRedirectTo v
// src/app/register/actions.ts). Supabase pošlje sem bodisi PKCE "code" bodisi
// starejši "token_hash"+"type" format - v obeh primerih moramo sejo
// vzpostaviti TUKAJ (route handler), ker Server Component (npr. /owner
// samo) ne sme trajno nastaviti cookie-jev. Šele po tem se seja dejansko
// prime, /owner pa nato izvede svoje lastno preverjanje odobritve.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const supabase = await createClient();

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  } else if (tokenHash && type) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase.auth.verifyOtp({ type: type as any, token_hash: tokenHash });
  }

  return NextResponse.redirect(`${origin}/owner`);
}
