import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveSalonTheme } from "@/lib/constants";
import { addEmployee, updateEmployee } from "../employees-actions";
import EmployeeHoursEditor from "./employee-hours-editor";
import PoweredBy from "@/components/powered-by";
import ThemeToggle from "@/components/theme-toggle";

const inputClass =
  "w-full rounded-md border border-border bg-ink-field px-3 py-2 text-cream text-sm";

export default async function EmployeesPage({
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

  const { data: employees, error: employeesError } = await supabase
    .from("employees")
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
            <h1 className="font-display text-2xl text-gold mb-1">Zaposleni</h1>
            <p className="text-sm text-cream-faint">
              Vsak zaposleni ima svoj urnik - stranke lahko izberejo, pri kom
              želijo termin. Če tudi sam/-a sprejemaš termine, se dodaj kot
              zaposleni/-a.
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

        {employeesError ? (
          <p className="text-sm text-rose">
            Napaka pri branju zaposlenih: {employeesError.message}
          </p>
        ) : (
          <div className="space-y-4 mb-8">
            {employees?.length === 0 && (
              <p className="text-sm text-cream-dim">
                Še nimaš dodanega nobenega zaposlenega - rezervacijska stran deluje enako kot doslej.
              </p>
            )}
            {employees?.map((employee) => (
              <div
                key={employee.id}
                className="border border-border rounded-lg bg-panel p-4 space-y-4"
              >
                <form
                  action={updateEmployee.bind(null, employee.id)}
                  className="flex flex-wrap items-end gap-3"
                >
                  <div className="flex-1 min-w-[160px] space-y-1">
                    <label className="text-xs text-cream-faint">Ime</label>
                    <input
                      name="name"
                      defaultValue={employee.name}
                      required
                      className={inputClass}
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-cream-dim pb-2">
                    <input
                      type="checkbox"
                      name="active"
                      defaultChecked={employee.active}
                      className="cursor-pointer"
                    />
                    Aktiven
                  </label>
                  <button
                    type="submit"
                    className="text-xs px-3 py-1.5 rounded-md bg-burgundy text-on-accent font-medium cursor-pointer hover:opacity-90"
                  >
                    Shrani
                  </button>
                </form>
                {!employee.active && (
                  <p className="text-xs text-cream-faint">
                    Neaktiven - ne prikaže se pri izbiri za nove rezervacije, že obstoječi termini zanj ostanejo v veljavi.
                  </p>
                )}
                <div>
                  <p className="text-xs text-cream-faint mb-2">Urnik</p>
                  <EmployeeHoursEditor employeeId={employee.id} initialHours={employee.hours} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="border border-gold/40 rounded-lg bg-panel p-4">
          <h2 className="text-sm font-medium text-cream-dim mb-3">Dodaj novega zaposlenega</h2>
          <form action={addEmployee} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[160px] space-y-1">
              <label className="text-xs text-cream-faint">Ime</label>
              <input name="name" required className={inputClass} />
            </div>
            <button
              type="submit"
              className="text-xs px-4 py-2 rounded-md bg-burgundy text-on-accent font-medium cursor-pointer hover:opacity-90"
            >
              Dodaj
            </button>
          </form>
          <p className="text-xs text-cream-faint mt-2">
            Nov zaposleni podeduje trenutni delovni čas salona - urnik lahko takoj prilagodiš zgoraj.
          </p>
        </div>
      </div>
    </div>
  );
}
