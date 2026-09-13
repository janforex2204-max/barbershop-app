"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PLATFORM_NAME } from "@/lib/constants";

type Status = "checking" | "ready" | "invalid" | "done";

export default function ResetPasswordPage() {
  const supabase = createClient();

  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Supabase klient ob nalaganju strani sam prebere access_token (ali PKCE
  // "code") iz URL-ja in vzpostavi začasno sejo za ponastavitev gesla - takrat
  // sproži dogodek "PASSWORD_RECOVERY". Če seja že obstaja (dogodek je ušel
  // pred prijavo na listener), to preverimo tudi z getSession().
  useEffect(() => {
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
      setError(error.message);
      return;
    }

    setStatus("done");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink font-sans px-4">
      <div className="w-full max-w-sm border border-border rounded-lg p-6 space-y-4">
        <div>
          <p className="text-[11px] text-cream-ghost tracking-wide mb-2">
            Powered by {PLATFORM_NAME}
          </p>
          <h1 className="text-xl font-semibold text-cream">
            Nastavi novo geslo
          </h1>
        </div>

        {status === "checking" && (
          <p className="text-sm text-cream-dim">Preverjam povezavo...</p>
        )}

        {status === "invalid" && (
          <div className="space-y-3">
            <p className="text-sm text-rose bg-[#2A1616] border border-[#4A2626] rounded-md px-3 py-2">
              Povezava za ponastavitev gesla je neveljavna ali je potekla.
              Zahtevaj novo na prijavni strani.
            </p>
            <a
              href="/owner/login"
              className="block text-center w-full rounded-md border border-border text-cream text-sm font-medium py-2 hover:bg-ink-soft"
            >
              Nazaj na prijavo
            </a>
          </div>
        )}

        {status === "done" && (
          <div className="space-y-3">
            <p className="text-sm text-sage bg-[#16241a] border border-[#2a4a34] rounded-md px-3 py-2">
              Geslo je uspešno posodobljeno.
            </p>
            <a
              href="/owner"
              className="block text-center w-full rounded-md bg-burgundy text-cream text-sm font-medium py-2 hover:opacity-90"
            >
              Pojdi na nadzorno ploščo
            </a>
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-sm text-rose bg-[#2A1616] border border-[#4A2626] rounded-md px-3 py-2">
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
              className="w-full rounded-md bg-burgundy text-cream text-sm font-medium py-2 hover:opacity-90 cursor-pointer disabled:opacity-60"
            >
              Shrani novo geslo
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
