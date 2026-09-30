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

// Lastnikova salon_owners VRSTICA, ključena po user_id - PRED tem jo je
// vsaka od štirih /owner/* strani (owner/page.tsx, employees/page.tsx,
// services/page.tsx, hours/page.tsx) brala SVEŽE, neodvisno, ob VSAKEM
// obisku (izmerjeno: ~1-1.3s na hladen obisk podstrani, brez izboljšave ob
// ponovnem obisku - glej pogovor s Claude, celovita revizija zmogljivosti).
// To je LOČENO od auth.getUser() klica, ki v vsaki strani/akciji OSTAJA
// nespremenjen in NENAMENOMA ni predpomnjen - Supabase eksplicitno
// priporoča klic getUser() v VSAKI server komponenti/akciji (ne samo v
// middleware), kot namerno globinsko obrambo, zato ta klic tu ni zajet.
// Sama VRSTICA (ime/slug/ure/plan/...) pa se spreminja redko - kratkotrajno
// predpomnjenje po user_id odpravi ponovno poizvedbo ob preklopu med
// podstranmi znotraj tega okna. Vsak porabnik izbere podmnožico stolpcev, ki
// jih potrebuje - eno (nadmnožico) poizvedbo tu si delijo vsi štirje.
export const OWNER_PROFILE_TAG = "owner-profile";

export const getCachedOwnerRow = unstable_cache(
  async (userId: string) => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("salon_owners")
      .select(
        "id, salon_name, slug, status, plan, hours, category, logo_url, notification_preference"
      )
      .eq("user_id", userId)
      .maybeSingle();
    return data;
  },
  ["owner-row"],
  { revalidate: 30, tags: [OWNER_PROFILE_TAG] }
);

// Isti razlog/vzorec kot getCachedOwnerRow zgoraj, tu za employees - deli si
// jo owner/page.tsx (koledarski razpon/barve) IN owner/employees/page.tsx
// (upravljanje) namesto vsak svoje, ločene poizvedbe na isto tabelo.
export const OWNER_EMPLOYEES_TAG = "owner-employees";

export const getCachedEmployeesList = unstable_cache(
  async (salonId: string) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("employees")
      .select("id, name, hours, color, photo_url, active, sort_order, schedule_token")
      .eq("salon_id", salonId)
      .order("sort_order", { ascending: true });
    return { employees: data ?? [], error: error?.message ?? null };
  },
  ["owner-employees-list"],
  { revalidate: 30, tags: [OWNER_EMPLOYEES_TAG] }
);

// Isti razlog/vzorec kot zgoraj, za owner/services/page.tsx.
export const OWNER_SERVICES_TAG = "owner-services";

export const getCachedServicesList = unstable_cache(
  async (salonId: string) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("services")
      .select("*")
      .eq("salon_id", salonId)
      .order("sort_order", { ascending: true });
    return { services: data ?? [], error: error?.message ?? null };
  },
  ["owner-services-list"],
  { revalidate: 30, tags: [OWNER_SERVICES_TAG] }
);

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

// Za tedenski pogled (owner/week-calendar.tsx) - ena poizvedba za celoten
// prikazan teden (7 dni), isti "range poizvedba namesto po-dnevne" pristop
// kot getCachedMonthOverview zgoraj, a s polnimi stolpci (čas/trajanje/
// zaposleni/stranka/storitev), ki jih risba mreže dejansko potrebuje - ne
// samo štetje kot mesečni pregled.
export const getCachedWeekData = unstable_cache(
  async (salonId: string, weekStart: string, weekEnd: string) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("appointments")
      .select(
        "id, appointment_date, appointment_time, duration_minutes, customer_name, service, employee_id, owner_note"
      )
      .eq("salon_id", salonId)
      .gte("appointment_date", weekStart)
      .lte("appointment_date", weekEnd)
      .neq("status", "cancelled")
      .order("appointment_time", { ascending: true });
    return { appointments: data ?? [], error: error?.message ?? null };
  },
  ["owner-week-data"],
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
