import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { translateAuthError } from "@/lib/auth-errors";

// Cilj povezave za potrditev e-pošte (glej emailRedirectTo v
// src/app/register/actions.ts). Supabase pošlje sem bodisi PKCE "code" bodisi
// starejši "token_hash"+"type" format - v obeh primerih moramo sejo
// vzpostaviti TUKAJ (route handler), ker Server Component (npr. /owner
// samo) ne sme trajno nastaviti cookie-jev. Šele po tem se seja dejansko
// prime, /owner pa nato izvede svoje lastno preverjanje odobritve.
//
// PREJ se je napaka pri exchangeCodeForSession/verifyOtp TIHO ignorirala in
// je uporabnik vseeno pristal na /owner (ki ga je middleware, ker seje NI
// bilo, brez pojasnila poslal nazaj na /) - videti je bilo, kot da je
// potrditev uspela, dejansko pa email_confirmed_at NI bil nastavljen, kar se
// je pokazalo šele kasneje kot zavajajoča "Email not confirmed" napaka ob
// prijavi. Zdaj napako preverimo in jo pokažemo - najpogostejši realen vzrok
// je PKCE "code" povezava, odprta v DRUGEM brskalniku/napravi kot tisti, ki
// je sprožil registracijo (code_verifier je shranjen v cookie-ju TISTE
// seje) - to Supabase sam vrne kot napako, ne kot tih neuspeh.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const supabase = await createClient();

  let error: { message: string } | null = null;

  if (code) {
    const result = await supabase.auth.exchangeCodeForSession(code);
    error = result.error;
  } else if (tokenHash && type) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await supabase.auth.verifyOtp({ type: type as any, token_hash: tokenHash });
    error = result.error;
  } else {
    error = { message: "Missing confirmation parameters" };
  }

  if (error) {
    console.error("[auth/confirm] Potrditev e-pošte ni uspela:", error.message);
    return NextResponse.redirect(
      `${origin}/?error=${encodeURIComponent(
        translateAuthError(
          error.message,
          "Potrditev e-pošte ni uspela. Če si povezavo odprl/a v drugem brskalniku ali napravi kot tisto, s katero si se registriral/a, jo poskusi odpreti v isti napravi, ali zahtevaj novo povezavo."
        )
      )}`
    );
  }

  return NextResponse.redirect(`${origin}/owner`);
}
