// Supabase Auth (GoTrue) sporočila o napakah so vedno v angleščini - sam jih
// ne lokalizira. Ta seznam prevede najpogostejša v slovenščino; karkoli se
// ne ujema, dobi splošno slovensko sporočilo namesto surove angleščine
// (izvirnik naj klicatelj PRED klicem te funkcije zabeleži prek
// console.error, če ga bomo morda želeli kasneje dodati na spodnji seznam).
//
// Ujemanje je namenoma na VZOREC (regex), ne točno enakost - GoTrue
// nekatera sporočila sestavi dinamično (npr. "... after 34 seconds").
const TRANSLATIONS: [RegExp, string | ((match: RegExpMatchArray) => string)][] = [
  [/invalid login credentials/i, "Napačna e-pošta ali geslo."],
  [
    /email not confirmed/i,
    "E-poštni naslov še ni potrjen. Preveri poštni predal (in mapo z vsiljeno pošto) in klikni na potrditveno povezavo.",
  ],
  [/user already registered/i, "Uporabnik s tem e-poštnim naslovom je že registriran."],
  [
    /password should be at least (\d+) characters?/i,
    (m) => `Geslo mora imeti vsaj ${m[1]} znakov.`,
  ],
  [/unable to validate email address/i, "Neveljaven format e-poštnega naslova."],
  [
    /email rate limit exceeded/i,
    "Preseženo je dovoljeno število zahtev za to e-pošto. Poskusi znova čez nekaj časa.",
  ],
  [
    /for security purposes, you can only request this after (\d+) seconds?/i,
    (m) => `Iz varnostnih razlogov lahko to zahtevo ponoviš šele čez ${m[1]} sekund.`,
  ],
  [
    /new password should be different from the old password/i,
    "Novo geslo se mora razlikovati od starega.",
  ],
  [
    /token has expired or is invalid/i,
    "Povezava je potekla ali ni veljavna. Zahtevaj novo.",
  ],
  [
    /error sending confirmation email/i,
    "Napaka pri pošiljanju potrditvenega e-maila. Poskusi znova čez trenutek.",
  ],
  [/user not found/i, "Uporabnik ne obstaja."],
  [/signup requires a valid password/i, "Registracija zahteva veljavno geslo."],
  [/email .* is invalid/i, "Neveljaven e-poštni naslov."],
  [
    /email link is invalid or has expired/i,
    "Povezava je neveljavna ali je potekla. Zahtevaj novo.",
  ],
];

export function translateAuthError(
  message: string | null | undefined,
  fallback = "Prišlo je do napake. Poskusi znova."
): string {
  if (!message) return fallback;
  for (const [pattern, translation] of TRANSLATIONS) {
    const match = message.match(pattern);
    if (match) {
      return typeof translation === "function" ? translation(match) : translation;
    }
  }
  return fallback;
}
