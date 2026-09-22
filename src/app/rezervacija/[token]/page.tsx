import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
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
      }}
      salonId={appt.salon_id}
      salonName={salon.salon_name}
      salonHours={salon.hours}
      salonCategory={salon.category}
    />
  );
}
