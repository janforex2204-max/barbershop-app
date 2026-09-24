import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SalonDayHours } from "@/types/database.types";
import ManageBookingPage from "./manage-booking-page";

// Token JE avtorizacija (glej supabase/schema.sql) - zato admin klient, mimo
// RLS, ne createClient() (ki bi tako ali tako vrnil prazno - anon nima
// SELECT pravice na appointments, glej "appointments_anon_insert" v shemi).
// Namenoma BREZ prijave - stranka to stran odpre iz WhatsApp/email povezave,
// ne kot prijavljen uporabnik.
export default async function RezervacijaTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: appt } = await admin
    .from("appointments")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!appt) {
    notFound();
  }

  const { data: salon } = await admin
    .from("salon_owners")
    .select("salon_name, hours, category")
    .eq("id", appt.salon_id)
    .maybeSingle();

  if (!salon) {
    notFound();
  }

  // Zaposleni se pri prenaročanju NIKOLI ne izbira znova - samo prenese
  // (glej pogovor s Claude, arhitekturni načrt). null, če je bil termin
  // rezerviran brez dodeljenega zaposlenega (salon brez te funkcionalnosti,
  // ali termin izpred nje).
  let employeeName: string | null = null;
  let employeeHours: SalonDayHours[] | null = null;
  if (appt.employee_id) {
    const { data: employee } = await admin
      .from("employees")
      .select("name, hours")
      .eq("id", appt.employee_id)
      .maybeSingle();
    if (employee) {
      employeeName = employee.name;
      employeeHours = employee.hours;
    }
  }

  return (
    <ManageBookingPage
      token={token}
      appointment={{
        service: appt.service,
        date: appt.appointment_date,
        time: appt.appointment_time,
        durationMinutes: appt.duration_minutes ?? 30,
        status: appt.status,
        customerName: appt.customer_name,
        employeeId: appt.employee_id,
      }}
      salonId={appt.salon_id}
      salonName={salon.salon_name}
      salonHours={salon.hours}
      salonCategory={salon.category}
      employeeName={employeeName}
      employeeHours={employeeHours}
    />
  );
}
