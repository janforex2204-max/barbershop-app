"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { CANCELLATION_NOTICE_HOURS, isPastCancellationDeadline } from "@/lib/constants";
import { notifyAffectedCustomersOfCancellation } from "@/lib/cancellation";
import {
  resolveDayWindow,
  resolveDayBreak,
  isSlotAvailable,
} from "@/lib/availability";
import { busyForEmployee, type EmployeeBusyRow } from "@/lib/employee-availability";

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

  // Zaposleni se pri prenaročanju NIKOLI ne izbira znova, samo prenese
  // (glej pogovor s Claude, arhitekturni načrt) - appt.employee_id je že
  // fiksen iz izvirne rezervacije, tudi če je bil ta zaposleni medtem
  // deaktiviran (deaktivacija ne sme orositi že obstoječih terminov).
  let effectiveHours = salon?.hours ?? null;
  if (appt.employee_id) {
    const { data: employee } = await admin
      .from("employees")
      .select("hours")
      .eq("id", appt.employee_id)
      .maybeSingle();
    if (employee) effectiveHours = employee.hours;
  }

  const window = resolveDayWindow(effectiveHours, input.date);

  // Neposredno iz appointments (admin klient, mimo public_availability) -
  // izključi TRENUTNI termin (appt.id), da ne "blokira" sam sebe pri
  // ponovni izbiri istega/bližnjega časa.
  const { data: busyRows } = await admin
    .from("appointments")
    .select("appointment_time, duration_minutes, employee_id")
    .eq("salon_id", appt.salon_id)
    .eq("appointment_date", input.date)
    .neq("id", appt.id)
    .neq("status", "cancelled");

  const rawBusy: EmployeeBusyRow[] = (busyRows ?? []).map((r) => ({
    time: r.appointment_time,
    durationMinutes: r.duration_minutes ?? 60,
    employeeId: r.employee_id ?? null,
  }));
  // Fiksen zaposleni (glej zgoraj) - dvonivojski filter (src/lib/employee-
  // availability.ts) uporabi appt.employee_id neposredno, brez ponovnega
  // poizvedovanja "ali ima salon aktivne zaposlene".
  const busy = busyForEmployee(rawBusy, appt.employee_id, appt.employee_id !== null);
  const dayBreak = resolveDayBreak(effectiveHours, input.date);
  if (dayBreak) busy.push(dayBreak);

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
