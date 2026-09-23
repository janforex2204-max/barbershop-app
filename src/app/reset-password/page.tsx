"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PoweredBy from "@/components/powered-by";
import { translateAuthError } from "@/lib/auth-errors";

type Status = "checking" | "ready" | "invalid" | "done";

const DEFAULT_INVALID_MESSAGE =
  "Povezava za ponastavitev gesla je neveljavna ali je potekla. Zahtevaj novo na prijavni strani.";

// Prebrano SAMO ob prvem renderju (glej useState spodaj, ne useEffect) - ta
// stran je "use client", zato je window na voljo že takrat. Sinhroni
// setState znotraj useEffect-a je namerno prepovedan (react-hooks lint) -
// zato ?error= preberemo tu, ne v spodnjem efektu.
function initialErrorFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("error");
}

export default function ResetPasswordPage() {
  const supabase = createClient();
  const [initialError] = useState(initialErrorFromUrl);

  const [status, setStatus] = useState<Status>(initialError ? "invalid" : "checking");
  const invalidMessage = initialError ?? DEFAULT_INVALID_MESSAGE;
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Izmenjava kode/tokena za sejo se od zdaj naprej zgodi STREŽNIŠKO, v
  // /auth/confirm (glej route.ts + redirectTo v forgot-password.tsx), PREDEN
  // uporabnik sploh pristane tu - seja je torej praviloma že vzpostavljena.
  // Napaka pri tisti izmenjavi pride nazaj kot ?error= na TEJ isti povezavi
  // (glej auth/confirm/route.ts, initialErrorFromUrl zgoraj jo že prebere).
  // getSession() spodaj je zato primarna pot; poslušanje na PASSWORD_RECOVERY
  // ostaja kot varovalka za starejšo, že poslano povezavo (izpred te
  // spremembe), ki bi še vedno kazala naravnost na /reset-password.
  useEffect(() => {
    if (initialError) return;

    let settled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        settled = true;
        setStatus("ready");
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!settled && data.session) {
        settled = true;
        setStatus("ready");
      }
    });

    const timeout = setTimeout(() => {
      if (!settled) setStatus("invalid");
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Geslo mora imeti vsaj 6 znakov.");
      return;
    }
    if (password !== confirm) {
      setError("Gesli se ne ujemata.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      console.error("[reset-password] updateUser:", error.message);
      setError(translateAuthError(error.message));
      return;
    }

    setStatus("done");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink font-sans px-4">
      <div className="w-full max-w-sm border border-border rounded-lg p-6 space-y-4">
        <div>
          <PoweredBy className="mb-2" />
          <h1 className="text-xl font-semibold text-cream">
            Nastavi novo geslo
          </h1>
        </div>

        {status === "checking" && (
          <p className="text-sm text-cream-dim">Preverjam povezavo...</p>
        )}

        {status === "invalid" && (
          <div className="space-y-3">
            <p className="text-sm text-rose bg-danger-bg border border-danger-border rounded-md px-3 py-2">
              {invalidMessage}
            </p>
            <Link
              href="/"
              className="block text-center w-full rounded-md border border-border text-cream text-sm font-medium py-2 hover:bg-ink-soft"
            >
              Nazaj na prijavo
            </Link>
          </div>
        )}

        {status === "done" && (
          <div className="space-y-3">
            <p className="text-sm text-sage bg-success-bg border border-success-border rounded-md px-3 py-2">
              Geslo je uspešno posodobljeno.
            </p>
            <Link
              href="/owner"
              className="block text-center w-full rounded-md bg-burgundy text-on-accent text-sm font-medium py-2 hover:opacity-90"
            >
              Pojdi na nadzorno ploščo
            </Link>
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-sm text-rose bg-danger-bg border border-danger-border rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <div className="space-y-1">
              <label htmlFor="password" className="text-sm text-cream-dim">
                Novo geslo
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-ink-field px-3 py-2 text-cream text-sm"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="confirm" className="text-sm text-cream-dim">
                Ponovi geslo
              </label>
              <input
                id="confirm"
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-md border border-border bg-ink-field px-3 py-2 text-cream text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-burgundy text-on-accent text-sm font-medium py-2 hover:opacity-90 cursor-pointer disabled:opacity-60"
            >
              Shrani novo geslo
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
