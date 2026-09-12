import { SHOP_NAME } from "@/lib/constants";

export default function RegisterSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-ink font-sans px-4">
      <div className="w-full max-w-sm border border-border rounded-lg p-6 space-y-4 text-center">
        <p className="font-display text-lg text-gold">{SHOP_NAME}</p>
        <p className="text-sm text-sage bg-[#16241a] border border-[#2a4a34] rounded-md px-3 py-2">
          Registracija uspešna.
        </p>
        <p className="text-sm text-cream-muted">
          Tvoj račun čaka na ročno odobritev. Ko bo odobren, se boš lahko
          prijavil/a in videl/a nadzorno ploščo.
        </p>
        <a
          href="/owner/login"
          className="block w-full rounded-md border border-border text-cream text-sm font-medium py-2 hover:bg-ink-soft"
        >
          Nazaj na prijavo
        </a>
      </div>
    </div>
  );
}
