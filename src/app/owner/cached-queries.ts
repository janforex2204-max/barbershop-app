import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

// Zakaj admin (service_role) klient tu, ne običajni SSR klient: unstable_cache
// NE sme brati per-request dinamičnih virov (cookies) - klicatelj mora
// salonId razrešiti PREJ, s svojo (RLS-scoped) sejo, in ga sem podati kot
// argument (glej owner/page.tsx). Eksplicitni `.eq("salon_id", salonId)`
// filter spodaj daje ISTO izolacijo med saloni kot RLS, samo brez odvisnosti
// od seje znotraj predpomnjene funkcije.
//
// Vsak klic je predpomnjen kratek čas (revalidate) - obisk ISTEGA
// meseca/dneva v tem oknu je torej brez nove poizvedbe na Supabase (glavni
// vzrok počasnega preklapljanja: prej se je VSEH 7 poizvedb izvedlo znova ob
// vsakem kliku, tudi za mesec/dan, ki ga je uporabnik ravno zapustil). Ob
// dejanski spremembi podatkov (odpoved/dodajanje termina, glej ./actions.ts)
// se ustrezna oznaka takoj invalidira prek updateTag - lastnik SVOJE
// spremembe vidi takoj, cache samo prihrani ponovno branje NESPREMENJENIH
// mesecev/dni.
// En SAM, skupen tag za vse salone (namesto po-salon taga) - unstable_cache
// tretji argument (tags) se ovrednoti EN krat, ob definiciji funkcije, ne ob
// vsakem klicu, zato ga ni mogoče izpeljati iz salonId (argumenta klica).
// Sprejemljiv kompromis: ./actions.ts (updateTag(OWNER_CALENDAR_TAG)) s tem
// malce prevelikodušno invalidira TUDI predpomnjene podatke drugih salonov
// (ne samo klicateljevega), kar je za majhno število salonov na tej
// platformi zanemarljivo - pravilnost ni prizadeta (Server Action, ki to
// pokliče, tako ali tako bere/piše samo v svoj lasten salon prek RLS).
export const OWNER_CALENDAR_TAG = "owner-calendar";

export const getCachedMonthOverview = unstable_cache(
  async (salonId: string, monthStart: string, monthEnd: string) => {
    const admin = createAdminClient();
    const [{ data: appointments }, { data: waitlist }] = await Promise.all([
      admin
        .from("appointments")
        .select("appointment_date")
        .eq("salon_id", salonId)
        .gte("appointment_date", monthStart)
        .lte("appointment_date", monthEnd)
        .neq("status", "cancelled"),
      admin
        .from("waitlist")
        .select("preferred_date")
        .eq("salon_id", salonId)
        .gte("preferred_date", monthStart)
        .lte("preferred_date", monthEnd),
    ]);
    return { appointments: appointments ?? [], waitlist: waitlist ?? [] };
  },
  ["owner-month-overview"],
  { revalidate: 20, tags: [OWNER_CALENDAR_TAG] }
);

export const getCachedDayData = unstable_cache(
  async (salonId: string, date: string) => {
    const admin = createAdminClient();
    const [
      { data: appointments, error },
      { data: waitlist, error: waitlistError, count: waitlistTotal },
      { data: smsLog, error: smsError },
      { data: autoSmsLog },
    ] = await Promise.all([
      admin
        .from("appointments")
        .select("*")
        .eq("salon_id", salonId)
        .eq("appointment_date", date)
        .order("appointment_time", { ascending: true }),
      admin
        .from("waitlist")
        .select("*", { count: "exact" })
        .eq("salon_id", salonId)
        .eq("preferred_date", date)
        .order("created_at", { ascending: true })
        .limit(50),
      admin
        .from("sms_notifications")
        .select("*")
        .eq("salon_id", salonId)
        .eq("status", "pending")
        .eq("appointment_date", date)
        .order("created_at", { ascending: true }),
      admin
        .from("sms_notifications")
        .select("*")
        .eq("salon_id", salonId)
        .eq("auto_sent", true)
        .eq("appointment_date", date)
        .order("created_at", { ascending: true }),
    ]);
    return {
      appointments: appointments ?? [],
      error: error?.message ?? null,
      waitlist: waitlist ?? [],
      waitlistError: waitlistError?.message ?? null,
      waitlistTotal: waitlistTotal ?? 0,
      smsLog: smsLog ?? [],
      smsError: smsError?.message ?? null,
      autoSmsLog: autoSmsLog ?? [],
    };
  },
  ["owner-day-data"],
  { revalidate: 20, tags: [OWNER_CALENDAR_TAG] }
);

export const getCachedTomorrowAppointments = unstable_cache(
  async (salonId: string, date: string) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("appointments")
      .select("*")
      .eq("salon_id", salonId)
      .eq("appointment_date", date)
      .neq("status", "cancelled")
      .order("appointment_time", { ascending: true });
    return { appointments: data ?? [], error: error?.message ?? null };
  },
  ["owner-tomorrow"],
  { revalidate: 20, tags: [OWNER_CALENDAR_TAG] }
);
