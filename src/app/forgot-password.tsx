"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { translateAuthError } from "@/lib/auth-errors";
import { PLATFORM_URL } from "@/lib/constants";

export default function ForgotPassword() {
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function sendResetLink(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    // Isti razlog kot emailRedirectTo v register/actions.ts - NE
    // window.location.origin naravnost, ker Vercel poleg prave domene servira
    // tudi svoj "<projekt>.vercel.app" naslov; če je uporabnik TAM, bi
    // povezava za ponastavitev pristala na napačni domeni.
    const isLocalOrigin =
      window.location.origin.startsWith("http://localhost") ||
      window.location.origin.startsWith("http://127.0.0.1");
    const redirectOrigin = isLocalOrigin ? window.location.origin : PLATFORM_URL;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${redirectOrigin}/reset-password`,
    });
    setSubmitting(false);
    if (error) console.error("[forgot-password] resetPasswordForEmail:", error.message);
    setMessage(
      error
        ? translateAuthError(error.message)
        : "Če ta e-pošta obstaja, je bila poslana povezava za ponastavitev gesla."
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-cream-dim hover:text-cream underline cursor-pointer"
      >
        Pozabljeno geslo?
      </button>
    );
  }

  return (
    <form onSubmit={sendResetLink} className="space-y-2 pt-1">
      {message ? (
        <p className="text-xs text-cream-muted">{message}</p>
      ) : (
        <>
          <input
            type="email"
            required
            placeholder="E-pošta"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-border bg-ink-field px-3 py-2 text-cream text-sm"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md border border-border text-cream text-xs font-medium py-1.5 hover:bg-ink-soft cursor-pointer disabled:opacity-60"
          >
            Pošlji povezavo za ponastavitev
          </button>
        </>
      )}
    </form>
  );
}
