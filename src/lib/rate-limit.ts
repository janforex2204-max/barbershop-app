import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

// Rate limiting za javna obrazca na /[slug] (rezervacija IN čakalna vrsta -
// glej src/app/[slug]/actions.ts), da nekdo ne more hitro zaporedoma zasesti
// vseh prostih terminov / poplaviti čakalno vrsto z izmišljenimi podatki.
// Namenoma preprosto: šteje vrstice v `appointments`/`waitlist`, ki že
// obstajata (glej supabase/schema.sql) - brez Redis ali druge dodatne
// infrastrukture, ker gre za majhna javna obrazca in ne za API z visokim
// prometom. Šteta oba pool-a (appointments, waitlist) LOČENO - ista
// telefonska/IP lahko npr. ustvari 3 rezervacije IN 3 vnose v čakalno vrsto
// v istem oknu, ne skupaj 3.
//
// Če se ti spodnja limita izkažeta za preveč/premalo stroga, spremeni samo ti
// dve konstanti - nič drugega se ne dotika.
export const PHONE_LIMIT = 3;
export const PHONE_WINDOW_HOURS = 24;
export const IP_LIMIT = 5;
export const IP_WINDOW_HOURS = 1;

type RateLimitedTable = "appointments" | "waitlist";

// Prebere IP klienta iz "x-forwarded-for" (Vercel in večina reverse proxyjev
// vanj kot PRVI vnos vpišejo pravi naslov odjemalca, morebitni nadaljnji
// vnosi so vmesni proxyji) z "x-real-ip" kot rezervo. `NextRequest.ip`/`geo`
// sta bila odstranjena v v15 (glej next/dist/docs .../next-request.md), zato
// v Server Actionih (kjer ni dostopa do NextRequest) IP beremo tukaj.
export async function getClientIp(): Promise<string | null> {
  const headersList = await headers();

  const forwardedFor = headersList.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  return headersList.get("x-real-ip");
}

// Uporabi service_role klienta (obide RLS), ker anon insert politike na obeh
// tabelah namenoma NE dovolijo SELECT - stranke ne smejo brati imen/telefonov
// drugih strank (glej supabase/schema.sql). Vrne samo da/ne + sporočilo,
// nikoli surovih vrstic navzven.
export async function checkRateLimit(
  table: RateLimitedTable,
  phone: string,
  ip: string | null
): Promise<{ limited: boolean; message?: string }> {
  const admin = createAdminClient();

  const phoneWindowStart = new Date(
    Date.now() - PHONE_WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { count: phoneCount, error: phoneError } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("customer_phone", phone)
    .gte("created_at", phoneWindowStart);

  if (phoneError) {
    // Ne blokiraj oddaje zaradi napake v samem rate limiterju - to je
    // dodatna zaščita, ne osrednja funkcionalnost (primerjaj z resolveSalonId
    // v actions.ts, ki NAMENOMA fail-closed, ker je tam napaka del kritične
    // poti).
    console.error(`Napaka pri preverjanju rate limita (telefon, ${table}):`, phoneError.message);
  } else if ((phoneCount ?? 0) >= PHONE_LIMIT) {
    return {
      limited: true,
      message:
        "Presegli ste dovoljeno število rezervacij za to telefonsko številko. Prosimo, kontaktirajte salon neposredno.",
    };
  }

  if (ip) {
    const ipWindowStart = new Date(
      Date.now() - IP_WINDOW_HOURS * 60 * 60 * 1000
    ).toISOString();

    const { count: ipCount, error: ipError } = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("ip_address", ip)
      .gte("created_at", ipWindowStart);

    if (ipError) {
      console.error(`Napaka pri preverjanju rate limita (IP, ${table}):`, ipError.message);
    } else if ((ipCount ?? 0) >= IP_LIMIT) {
      return {
        limited: true,
        message:
          "Presegli ste dovoljeno število rezervacij. Prosimo, kontaktirajte salon neposredno.",
      };
    }
  }

  return { limited: false };
}
