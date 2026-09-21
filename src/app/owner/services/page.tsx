import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice, formatDuration, resolveSalonTheme } from "@/lib/constants";
import { addService, deleteService, updateService } from "../services-actions";
import PoweredBy from "@/components/powered-by";
import ThemeToggle from "@/components/theme-toggle";

const inputClass =
  "w-full rounded-md border border-border bg-ink-field px-3 py-2 text-cream text-sm";

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorMessage } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  // Ista meja izolacije kot na /owner (glej owner/page.tsx) - vsaka
  // poizvedba spodaj MORA filtrirati po salonId.
  const { data: ownerRow } = await supabase
    .from("salon_owners")
    .select("id, status, category")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ownerRow || ownerRow.status !== "approved") {
    redirect("/owner");
  }

  const salonId = ownerRow.id;
  const salonTheme = resolveSalonTheme(ownerRow.category);

  const { data: services, error: servicesError } = await supabase
    .from("services")
    .select("*")
    .eq("salon_id", salonId)
    .order("sort_order", { ascending: true });

  return (
    <div data-theme={salonTheme} className="min-h-screen bg-ink text-cream font-sans px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <PoweredBy size="lg" />
          {!salonTheme && <ThemeToggle />}
        </div>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-2xl text-gold mb-1">Storitve in cenik</h1>
            <p className="text-sm text-cream-faint">
              Cene, ki jih tu nastaviš, se prikažejo strankam na rezervacijski strani.
            </p>
          </div>
          <Link
            href="/owner"
            className="text-sm border border-border rounded-md px-3 py-1.5 hover:bg-ink-soft whitespace-nowrap"
          >
            ← Nazaj
          </Link>
        </div>

        {errorMessage && (
          <p className="text-sm text-rose bg-danger-bg border border-danger-border rounded-md px-3 py-2 mb-4">
            {errorMessage}
          </p>
        )}

        {servicesError ? (
          <p className="text-sm text-rose">
            Napaka pri branju storitev: {servicesError.message}
          </p>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border-soft mb-8">
            {services?.length === 0 && (
              <p className="p-4 text-sm text-cream-dim">Še nimaš nobene storitve.</p>
            )}
            {services?.map((service) => (
              <form
                key={service.id}
                action={updateService.bind(null, service.id)}
                className="flex flex-wrap items-center gap-3 p-4"
              >
                <div className="flex-1 min-w-[160px] space-y-1">
                  <label className="text-xs text-cream-faint">Ime storitve</label>
                  <input
                    name="name"
                    defaultValue={service.name}
                    required
                    className={inputClass}
                  />
                </div>
                <div className="w-28 space-y-1">
                  <label className="text-xs text-cream-faint">Cena (€)</label>
                  <input
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="—"
                    defaultValue={service.price ?? ""}
                    className={inputClass}
                  />
                </div>
                <div className="w-28 space-y-1">
                  <label className="text-xs text-cream-faint">Trajanje (min)</label>
                  <input
                    name="duration_minutes"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="—"
                    defaultValue={service.duration_minutes ?? ""}
                    className={inputClass}
                  />
                </div>
                <div className="w-32 space-y-1">
                  <label className="text-xs text-cream-faint">Kategorija</label>
                  <input
                    name="category"
                    type="text"
                    placeholder="npr. Nohti"
                    defaultValue={service.category ?? ""}
                    className={inputClass}
                  />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-cream-dim pt-4">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={service.active}
                    className="cursor-pointer"
                  />
                  Aktivna
                </label>
                <div className="flex items-center gap-2 pt-4">
                  <button
                    type="submit"
                    className="text-xs px-3 py-1.5 rounded-md bg-burgundy text-on-accent font-medium cursor-pointer hover:opacity-90"
                  >
                    Shrani
                  </button>
                  <button
                    type="submit"
                    formAction={deleteService.bind(null, service.id)}
                    className="text-xs px-3 py-1.5 rounded border border-rose text-rose hover:bg-rose/10 cursor-pointer"
                  >
                    Izbriši
                  </button>
                </div>
                {!service.price && (
                  <p className="w-full text-xs text-cream-faint">
                    Cena še ni nastavljena - stranke bodo videle samo ime storitve.
                  </p>
                )}
                {!service.duration_minutes && (
                  <p className="w-full text-xs text-cream-faint">
                    Trajanje še ni nastavljeno.
                  </p>
                )}
              </form>
            ))}
          </div>
        )}

        <div className="border border-gold/40 rounded-lg p-4">
          <h2 className="text-sm font-medium text-cream-dim mb-3">Dodaj novo storitev</h2>
          <form action={addService} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[160px] space-y-1">
              <label className="text-xs text-cream-faint">Ime storitve</label>
              <input name="name" required className={inputClass} />
            </div>
            <div className="w-28 space-y-1">
              <label className="text-xs text-cream-faint">Cena (€)</label>
              <input
                name="price"
                type="number"
                min="0"
                step="0.01"
                placeholder="—"
                className={inputClass}
              />
            </div>
            <div className="w-28 space-y-1">
              <label className="text-xs text-cream-faint">Trajanje (min)</label>
              <input
                name="duration_minutes"
                type="number"
                min="1"
                step="1"
                placeholder="—"
                className={inputClass}
              />
            </div>
            <div className="w-32 space-y-1">
              <label className="text-xs text-cream-faint">Kategorija</label>
              <input
                name="category"
                type="text"
                placeholder="npr. Nohti"
                className={inputClass}
              />
            </div>
            <button
              type="submit"
              className="text-xs px-4 py-2 rounded-md bg-burgundy text-on-accent font-medium cursor-pointer hover:opacity-90"
            >
              Dodaj
            </button>
          </form>
        </div>

        {services && services.length > 0 && (
          <div className="mt-6 text-xs text-cream-faint">
            Predogled cenika strank: {formatPreview(services)}
          </div>
        )}
      </div>
    </div>
  );
}

function formatPreview(
  services: { name: string; price: number | null; duration_minutes: number | null; active: boolean }[]
) {
  const active = services.filter((s) => s.active);
  if (active.length === 0) return "trenutno ni aktivnih storitev.";
  return active
    .map((s) => {
      const details = [
        s.price ? formatPrice(s.price) : null,
        s.duration_minutes ? formatDuration(s.duration_minutes) : null,
      ].filter(Boolean);
      return details.length > 0 ? `${s.name} - ${details.join(", ")}` : s.name;
    })
    .join(" · ");
}
