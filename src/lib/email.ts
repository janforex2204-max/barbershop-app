import { PLATFORM_NAME, PLATFORM_URL } from "@/lib/constants";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Pošlje email obvestilo lastniku aplikacije ob novi registraciji, z gumbom
// za odobritev z enim klikom (glej src/app/admin/approve/route.ts).
// Uporablja Resend (resend.com) - preprost REST API, brez dodatnega paketa.
// Če RESEND_API_KEY ali OWNER_NOTIFICATION_EMAIL nista nastavljena, tiho
// preskoči (registracija se ne sme sesuti zaradi manjkajočega email servisa).
export async function notifyNewRegistration({
  email,
  salonName,
  approvalToken,
}: {
  email: string;
  salonName: string;
  approvalToken: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.OWNER_NOTIFICATION_EMAIL;

  if (!apiKey || !to) {
    console.warn(
      "RESEND_API_KEY ali OWNER_NOTIFICATION_EMAIL ni nastavljen - email obvestilo preskočeno."
    );
    return;
  }

  const approveUrl = `${PLATFORM_URL}/admin/approve?token=${approvalToken}`;
  const safeName = escapeHtml(salonName);
  const safeEmail = escapeHtml(email);

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
      text: `Nova registracija čaka na odobritev:\n\nSalon: ${salonName}\nE-pošta: ${email}\n\nOdobri s klikom: ${approveUrl}\n\n(Ali ročno v Supabase → Table Editor → salon_owners → status = "approved".)`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;">
          <p style="font-size:15px;color:#1b1815;">Nova registracija čaka na odobritev:</p>
          <p style="font-size:14px;color:#1b1815;margin:0 0 20px;">
            <b>Salon:</b> ${safeName}<br>
            <b>E-pošta:</b> ${safeEmail}
          </p>
          <a href="${approveUrl}"
             style="display:inline-block;background:#8C2F2F;color:#EFE6D8;text-decoration:none;
                    padding:12px 20px;border-radius:6px;font-size:14px;font-weight:600;">
            Odobri registracijo
          </a>
          <p style="font-size:12px;color:#8a8377;margin-top:20px;">
            Ali ročno v Supabase → Table Editor → salon_owners → status = "approved".
          </p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend napaka (${res.status}): ${body}`);
  }
}
