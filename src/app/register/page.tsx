import Link from "next/link";
import { registerOwner } from "./actions";
import PoweredBy from "@/components/powered-by";
import ThemeToggle from "@/components/theme-toggle";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-ink font-sans px-4">
      <div className="absolute top-6 left-6 flex items-center gap-3">
        <PoweredBy size="lg" href="/" />
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm border border-border rounded-lg p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-cream">
            Registracija lastnika
          </h1>
          <p className="text-xs text-cream-faint mt-1">
            Po registraciji tvoj račun čaka na odobritev.
          </p>
        </div>

        {error && (
          <p className="text-sm text-rose bg-danger-bg border border-danger-border rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <form action={registerOwner} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="salon_name" className="text-sm text-cream-dim">
              Ime podjetja
            </label>
            <input
              id="salon_name"
              name="salon_name"
              type="text"
              required
              className="w-full rounded-md border border-border bg-ink-field px-3 py-2 text-cream text-sm"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="email" className="text-sm text-cream-dim">
              E-pošta
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full rounded-md border border-border bg-ink-field px-3 py-2 text-cream text-sm"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-sm text-cream-dim">
              Geslo
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              className="w-full rounded-md border border-border bg-ink-field px-3 py-2 text-cream text-sm"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="phone" className="text-sm text-cream-dim">
              Telefonska številka
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              className="w-full rounded-md border border-border bg-ink-field px-3 py-2 text-cream text-sm"
            />
            <p className="text-xs text-cream-faint">
              Uporabljeno za WhatsApp obveščanje strank o terminih.
            </p>
          </div>

          <label className="flex items-start gap-2 text-xs text-cream-dim">
            <input
              type="checkbox"
              name="whatsapp_consent"
              value="true"
              required
              className="mt-0.5"
            />
            Strinjam se, da se moja telefonska številka uporabi za WhatsApp
            obveščanje strank
          </label>

          <button
            type="submit"
            className="w-full rounded-md bg-burgundy hover:opacity-90 text-on-accent text-sm font-medium py-2 transition-opacity cursor-pointer"
          >
            Registriraj se
          </button>
        </form>

        <Link
          href="/"
          className="block text-center text-xs text-cream-dim hover:text-cream underline"
        >
          Že imaš račun? Prijava
        </Link>
      </div>
    </div>
  );
}
