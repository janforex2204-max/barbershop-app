import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// SAMO za server-side admin operacije (npr. registracija lastnika, ko še
// nima seje). service_role ključ zaobide RLS - nikoli ga ne uvozi v "use
// client" datoteko in nikoli ne dodaj NEXT_PUBLIC_ predpone vanj.
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
