import Link from "next/link";
import { login } from "./owner/actions";
import ForgotPassword from "./forgot-password";
import PoweredBy from "@/components/powered-by";

// Primarna prijavna stran (fillio.si) za lastnike salonov na platformi.
// /owner/login je samo alias, ki sem preusmeri.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink font-sans px-4">
      <div className="w-full max-w-sm border border-border rounded-lg p-6 space-y-4">
        <div>
          <PoweredBy className="mb-2" />
          <h1 className="text-xl font-semibold text-cream">
            Prijava za lastnika
          </h1>
        </div>

        {error && (
          <p className="text-sm text-rose bg-[#2A1616] border border-[#4A2626] rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <form action={login} className="space-y-4">
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
              className="w-full rounded-md border border-border bg-ink-field px-3 py-2 text-cream text-sm"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-burgundy hover:opacity-90 text-cream text-sm font-medium py-2 transition-opacity cursor-pointer"
          >
            Prijava
          </button>
        </form>

        <ForgotPassword />

        <Link
          href="/register"
          className="block text-center text-xs text-cream-dim hover:text-cream underline"
        >
          Nimaš računa? Registracija
        </Link>
      </div>
    </div>
  );
}
