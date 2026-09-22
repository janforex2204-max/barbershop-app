"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { CANCELLATION_NOTICE_HOURS, isPastCancellationDeadline } from "@/lib/constants";
import { notifyAffectedCustomersOfCancellation } from "@/lib/cancellation";
import {
  resolveDayWindow,
  isSlotAvailable,
  type BusyInterval,
} from "@/lib/availability";

// Token JE avtorizacija (glej supabase/schema.sql - kriptografsko naključen,
// neuganljiv) - zato tu VEDNO admin (service_role) klient, mimo RLS (anon
// nima SELECT/UPDATE pravice na appointments). Nobenega dodatnega
// "lastništva" preverjanja ni - kdor pozna token svoje lastne rezervacije,
// sme z njo upravljati, enak vzorec kot salon_owners.approval_token.
export async function cancelBookingByToken(token: string): Promise<{ error?: string }> {
  const admin = createAdminClient();

  const { data: appt } = await admin
    .from("appointments")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!appt) {
    return { error: "Rezervacija ne obstaja." };
  }
  if (appt.status === "cancelled") {
    return { error: "Rezervacija je že odpovedana." };
  }
  if (isPastCancellationDeadline(appt.appointment_date, appt.appointment_time)) {
    return {
      error: `Odpoved je mogoča najkasneje ${CANCELLATION_NOTICE_HOURS} ure pred terminom. Za spremembo kontaktiraj salon neposredno.`,
    };
  }

  const { error } = await admin
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("token", token);

  if (error) {
    return { error: error.message };
  }

  // Ista logika kot pri lastnikovi odpovedi (owner/actions.ts) - obvesti
  // čakajoče stranke o sprostitvi, ne glede na to, KDO je odpovedal.
  await notifyAffectedCustomersOfCancellation(admin, appt);

  revalidatePath(`/rezervacija/${token}`);
  return {};
}

// Prenaročanje = UPDATE ISTE vrstice (ista storitev/trajanje, nov datum/ura),
// ne izbris+nov vnos - token in id termina ostaneta enaka. Preverba
// prekrivanja je isti vzorec kot bookAppointment ([slug]/actions.ts) in
// addManualAppointment (owner/actions.ts) - resolveDayWindow/isSlotAvailable,
// EN sam vir resnice (src/lib/availability.ts).
export async function rescheduleBookingByToken(
  token: string,
  input: { date: string; time: string }
): Promise<{ error?: string }> {
  const admin = createAdminClient();

  const { data: appt } = await admin
    .from("appointments")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!appt) {
    return { error: "Rezervacija ne obstaja." };
  }
  if (appt.status === "cancelled") {
    return { error: "Odpovedane rezervacije ni mogoče prenaročiti." };
  }
  // Prag velja za TRENUTNI (še veljavni) termin - ne za novo izbrani čas
  // (glej pogovor s Claude: nov termin je omejen samo z normalno
  // razpoložljivostjo, ne z rokom za odpoved).
  if (isPastCancellationDeadline(appt.appointment_date, appt.appointment_time)) {
    return {
      error: `Prenaročanje je mogoče najkasneje ${CANCELLATION_NOTICE_HOURS} ure pred terminom. Za spremembo kontaktiraj salon neposredno.`,
    };
  }

  const { data: salon } = await admin
    .from("salon_owners")
    .select("hours")
    .eq("id", appt.salon_id)
    .maybeSingle();

  const window = resolveDayWindow(salon?.hours ?? null, input.date);

  // Neposredno iz appointments (admin klient, mimo public_availability) -
  // izključi TRENUTNI termin (appt.id), da ne "blokira" sam sebe pri
  // ponovni izbiri istega/bližnjega časa.
  const { data: busyRows } = await admin
    .from("appointments")
    .select("appointment_time, duration_minutes")
    .eq("salon_id", appt.salon_id)
    .eq("appointment_date", input.date)
    .neq("id", appt.id)
    .neq("status", "cancelled");

  const busy: BusyInterval[] = (busyRows ?? []).map((r) => ({
    time: r.appointment_time,
    durationMinutes: r.duration_minutes ?? 60,
  }));

  const durationMinutes = appt.duration_minutes ?? 30;

  if (!isSlotAvailable(window, busy, durationMinutes, input.time)) {
    return { error: "Ta termin ni več na voljo. Izberi drugega." };
  }

  const { error } = await admin
    .from("appointments")
    .update({ appointment_date: input.date, appointment_time: input.time })
    .eq("token", token);

  if (error) {
    if (error.code === "23505") {
      return { error: "Ta termin je bil pravkar zaseden. Izberi drugega." };
    }
    return { error: error.message };
  }

  revalidatePath(`/rezervacija/${token}`);
  return {};
}
