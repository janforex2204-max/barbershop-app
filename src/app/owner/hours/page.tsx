import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveSalonTheme } from "@/lib/constants";
import { getCachedOwnerRow } from "../cached-queries";
import HoursEditorPage from "./hours-editor-page";
import PoweredBy from "@/components/powered-by";
import ThemeToggle from "@/components/theme-toggle";

// Edino mesto, kjer lastnik urnik lahko uredi PO registraciji (registracijski
// wizard, owner/register/page.tsx, ga zbere samo ob prvem vnosu) - prej
// tovrstna stran sploh ni obstajala. Isti izolacijski vzorec kot
// owner/services/page.tsx: salonId SAMO iz klicateljeve seje.
export default async function OwnerHoursPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  // getCachedOwnerRow (../cached-queries.ts) - prej sveža, nepredpomnjena
  // poizvedba ob VSAKEM obisku te strani (glej pogovor s Claude, celovita
  // revizija zmogljivosti).
  const ownerRow = await getCachedOwnerRow(user.id);

  if (!ownerRow || ownerRow.status !== "approved") {
    redirect("/owner");
  }

  const salonTheme = resolveSalonTheme(ownerRow.category);

  return (
    <div data-theme={salonTheme} className="min-h-screen bg-ink text-cream font-sans px-6 py-10">
      {/* Logotip NAMENOMA izven max-w-2xl stolpca spodaj - glej isti popravek
          na owner/page.tsx. */}
      <div className="flex items-center gap-3 mb-6">
        <PoweredBy size="lg" />
        {!salonTheme && <ThemeToggle />}
      </div>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-2xl text-gold mb-1">Delovni čas</h1>
            <p className="text-sm text-cream-faint">
              Urnik, ki ga tu nastaviš, se uporabi za proste termine na tvoji
              rezervacijski strani.
            </p>
          </div>
          <Link
            href="/owner"
            className="text-sm border border-border rounded-md px-3 py-1.5 hover:bg-ink-soft whitespace-nowrap"
          >
            ← Nazaj
          </Link>
        </div>

        <HoursEditorPage initialHours={ownerRow.hours} />
      </div>
    </div>
  );
}
