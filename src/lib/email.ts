import { PLATFORM_NAME } from "@/lib/constants";

// Pošlje email obvestilo lastniku aplikacije ob novi registraciji.
// Uporablja Resend (resend.com) - preprost REST API, brez dodatnega paketa.
// Če RESEND_API_KEY ali OWNER_NOTIFICATION_EMAIL nista nastavljena, tiho
// preskoči (registracija se ne sme sesuti zaradi manjkajočega email servisa).
export async function notifyNewRegistration({
  email,
  salonName,
}: {
  email: string;
  salonName: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.OWNER_NOTIFICATION_EMAIL;

  if (!apiKey || !to) {
    console.warn(
      "RESEND_API_KEY ali OWNER_NOTIFICATION_EMAIL ni nastavljen - email obvestilo preskočeno."
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${PLATFORM_NAME} <noreply@fillio.si>`,
      to,
      subject: "Nova registracija lastnika salona",
      text: `Nova registracija čaka na odobritev:\n\nSalon: ${salonName}\nE-pošta: ${email}\n\nOdobri v Supabase → Table Editor → salon_owners → nastavi status na "approved".`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend napaka (${res.status}): ${body}`);
  }
}
