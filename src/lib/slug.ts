import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// "Barbershop pr' Kljuni" -> "barbershop-pr-kljuni", "Salon Ana" -> "salon-ana".
export function slugify(input: string): string {
  const base = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // šumniki/naglasi (š/ž/č ...) -> osnovna črka
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "salon";
}

// Slugi, ki bi trčili z obstoječimi statičnimi potmi aplikacije (Next.js
// sicer vedno prednostno ujame statično pot pred /[slug], a če bi salon
// dobil enega od teh, njegova stran ne bi bila NIKOLI dosegljiva).
const RESERVED_SLUGS = new Set([
  "owner",
  "register",
  "admin",
  "auth",
  "api",
  "reset-password",
]);

// Doda "-2", "-3", ... če je osnovni slug že zaseden (ali rezerviran).
// Uporablja admin (service_role) klienta, ker registracija (kjer se to
// kliče) morda še nima aktivne seje z RLS dostopom do salon_owners.
export async function generateUniqueSlug(
  admin: SupabaseClient<Database>,
  salonName: string
): Promise<string> {
  const base = slugify(salonName);
  let candidate = base;
  let suffix = 2;

  while (true) {
    if (!RESERVED_SLUGS.has(candidate)) {
      const { data } = await admin
        .from("salon_owners")
        .select("id")
        .eq("slug", candidate)
        .maybeSingle();

      if (!data) return candidate;
    }

    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}
