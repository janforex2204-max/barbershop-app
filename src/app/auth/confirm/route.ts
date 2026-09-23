import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { translateAuthError } from "@/lib/auth-errors";

// Cilj VSAKE Supabase auth povezave, ki zahteva izmenjavo kode/tokena za
// sejo - potrditev e-pošte ob registraciji (glej emailRedirectTo v
// src/app/owner/register/actions.ts) IN ponastavitev gesla (glej redirectTo
// v forgot-password.tsx) - oboje deli TO ISTO, en sam preizkušeno pot,
// namesto da bi vsak tok sam poskušal vzpostaviti sejo na klientu (glej
// pogovor s Claude - reset-password/page.tsx je to prej počela sama, manj
// zanesljivo, ker seja ni bila vedno pravilno vzpostavljena, preden je
// stran sploh preverila getSession()). Supabase pošlje sem bodisi PKCE
// "code" bodisi starejši "token_hash"+"type" format - v obeh primerih
// moramo sejo vzpostaviti TUKAJ (route handler), ker Server Component (npr.
// /owner sam) ne sme trajno nastaviti cookie-jev.
//
// `next` (privzeto "/owner") pove, KAM naj po USPEŠNI izmenjavi preusmerimo -
// signup potrditev (brez next) gre na /owner, ponastavitev gesla pošlje
// ?next=/reset-password (glej forgot-password.tsx). Napaka preusmeri NA
// ISTO pot (če je next podan) z ?error=, da lahko tista stran napako pokaže
// v svojem kontekstu (glej reset-password/page.tsx) - sicer (signup, brez
// next) kot doslej na /owner/login.
//
// PREJ se je napaka pri exchangeCodeForSession/verifyOtp TIHO ignorirala in
// je uporabnik vseeno pristal na /owner (ki ga je middleware, ker seje NI
// bilo, brez pojasnila poslal nazaj na /) - videti je bilo, kot da je
// potrditev uspela, dejansko pa email_confirmed_at NI bil nastavljen, kar se
// je pokazalo šele kasneje kot zavajajoča "Email not confirmed" napaka ob
// prijavi. Zdaj napako preverimo in jo pokažemo - najpogostejši realen vzrok
// je PKCE "code" povezava, odprta v DRUGEM brskalniku/napravi kot tisti, ki
// je sprožil zahtevo (code_verifier je shranjen v cookie-ju TISTE seje) - to
// Supabase sam vrne kot napako, ne kot tih neuspeh.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next");

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
    console.error("[auth/confirm] Izmenjava kode/tokena za sejo ni uspela:", error.message);
    const fallbackMessage = next
      ? "Povezava za ponastavitev gesla je neveljavna ali je potekla. Zahtevaj novo na prijavni strani."
      : "Potrditev e-pošte ni uspela. Če si povezavo odprl/a v drugem brskalniku ali napravi kot tisto, s katero si se registriral/a, jo poskusi odpreti v isti napravi, ali zahtevaj novo povezavo.";
    return NextResponse.redirect(
      `${origin}${next ?? "/owner/login"}?error=${encodeURIComponent(
        translateAuthError(error.message, fallbackMessage)
      )}`
    );
  }

  return NextResponse.redirect(`${origin}${next ?? "/owner"}`);
}
