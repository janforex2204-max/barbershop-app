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

// Skupna pomožna funkcija za spodnje tri (lastniku IN stranki) - isti
// graceful-skip (manjkajoč RESEND_API_KEY ne sme podreti rezervacije/crona)
// in isto obravnavo napak kot notifyNewRegistration zgoraj.
async function sendPlatformEmail(to: string, subject: string, text: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`RESEND_API_KEY ni nastavljen - email (${to}) preskočen.`);
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
      subject,
      text,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend napaka (${res.status}): ${body}`);
  }
}

// Poslano lastniku (glej salon_owners.notification_preference = 'per_booking')
// TAKOJ ob vsaki novi rezervaciji na /[slug] - glej bookAppointment v
// src/app/[slug]/actions.ts. `to` je lastnikov auth email (getUserById), NE
// admin kontakt email (OWNER_NOTIFICATION_EMAIL zgoraj je za NAS, ne za
// salone).
export async function sendBookingNotification({
  to,
  salonName,
  customerName,
  customerPhone,
  service,
  dateLabel,
  time,
}: {
  to: string;
  salonName: string;
  customerName: string;
  customerPhone: string;
  service: string;
  dateLabel: string;
  time: string;
}) {
  const safeName = escapeHtml(customerName);
  const safePhone = escapeHtml(customerPhone);
  const safeService = escapeHtml(service);
  const safeSalon = escapeHtml(salonName);
  const safeDate = escapeHtml(dateLabel);

  await sendPlatformEmail(
    to,
    `Nova rezervacija - ${dateLabel} ob ${time}`,
    `Nova rezervacija za ${salonName}:\n\n${customerName} (${customerPhone})\n${service}\n${dateLabel} ob ${time}\n\nOglej si nadzorno ploščo: ${PLATFORM_URL}/owner`,
    `
      <div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;">
        <p style="font-size:15px;color:#1b1815;">Nova rezervacija za <b>${safeSalon}</b>:</p>
        <p style="font-size:14px;color:#1b1815;margin:0 0 20px;">
          <b>${safeName}</b> (${safePhone})<br>
          ${safeService}<br>
          ${safeDate} ob ${time}
        </p>
        <a href="${PLATFORM_URL}/owner"
           style="display:inline-block;background:#8C2F2F;color:#EFE6D8;text-decoration:none;
                  padding:12px 20px;border-radius:6px;font-size:14px;font-weight:600;">
          Odpri nadzorno ploščo
        </a>
      </div>
    `
  );
}

// Poslano lastniku (glej salon_owners.notification_preference = 'daily') iz
// dnevnega cron opravila - glej src/app/api/cron/daily-digest/route.ts.
export async function sendDailyDigest({
  to,
  salonName,
  dateLabel,
  appointments,
}: {
  to: string;
  salonName: string;
  dateLabel: string;
  appointments: { time: string; customerName: string; service: string }[];
}) {
  const safeSalon = escapeHtml(salonName);
  const safeDate = escapeHtml(dateLabel);

  const rowsText =
    appointments.length === 0
      ? "Danes ni rezerviranih terminov."
      : appointments.map((a) => `${a.time} - ${a.customerName} (${a.service})`).join("\n");

  const rowsHtml =
    appointments.length === 0
      ? `<p style="font-size:14px;color:#8a8377;">Danes ni rezerviranih terminov.</p>`
      : `<table style="width:100%;border-collapse:collapse;font-size:14px;color:#1b1815;">
          ${appointments
            .map(
              (a) => `
            <tr>
              <td style="padding:4px 8px 4px 0;font-weight:600;white-space:nowrap;">${escapeHtml(a.time)}</td>
              <td style="padding:4px 8px 4px 0;">${escapeHtml(a.customerName)}</td>
              <td style="padding:4px 0;color:#8a8377;">${escapeHtml(a.service)}</td>
            </tr>`
            )
            .join("")}
        </table>`;

  await sendPlatformEmail(
    to,
    `Dnevni povzetek - ${salonName} - ${dateLabel}`,
    `Termini za ${salonName}, ${dateLabel}:\n\n${rowsText}\n\nOglej si nadzorno ploščo: ${PLATFORM_URL}/owner`,
    `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;">
        <p style="font-size:15px;color:#1b1815;">Termini za <b>${safeSalon}</b>, ${safeDate}:</p>
        <div style="margin:0 0 20px;">${rowsHtml}</div>
        <a href="${PLATFORM_URL}/owner"
           style="display:inline-block;background:#8C2F2F;color:#EFE6D8;text-decoration:none;
                  padding:12px 20px;border-radius:6px;font-size:14px;font-weight:600;">
          Odpri nadzorno ploščo
        </a>
      </div>
    `
  );
}

// Poslano STRANKI (ne lastniku, v nasprotju z vsemi zgornjimi funkcijami) -
// ENKRATNA potrditvena e-pošta, ki jo stranka sama sproži na potrditveni
// strani po rezervaciji (glej addBookingConfirmationEmail v
// [slug]/actions.ts + opt-in polje v booking-page.tsx), če je vpisala svoj
// email - obrazec za rezervacijo ga NE zbira. Ločeno od plačljivega Fillio
// Pro obveščanja LASTNIKA (notification_preference, sendBookingNotification
// zgoraj) - to ni ponavljajoč opomnik, samo enkratna potrditev z
// manageUrl-om do /rezervacija/[token].
export async function sendBookingConfirmationEmail({
  to,
  salonName,
  service,
  dateLabel,
  time,
  manageUrl,
}: {
  to: string;
  salonName: string;
  service: string;
  dateLabel: string;
  time: string;
  manageUrl: string;
}) {
  const safeSalon = escapeHtml(salonName);
  const safeService = escapeHtml(service);
  const safeDate = escapeHtml(dateLabel);

  await sendPlatformEmail(
    to,
    `Potrditev rezervacije - ${salonName}`,
    `Tvoja rezervacija je potrjena:\n\n${salonName}\n${service}\n${dateLabel} ob ${time}\n\nUpravljaj svojo rezervacijo (odpoved/prenaročanje): ${manageUrl}`,
    `
      <div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;">
        <p style="font-size:15px;color:#1b1815;">Tvoja rezervacija pri <b>${safeSalon}</b> je potrjena:</p>
        <p style="font-size:14px;color:#1b1815;margin:0 0 20px;">
          ${safeService}<br>
          ${safeDate} ob ${time}
        </p>
        <a href="${manageUrl}"
           style="display:inline-block;background:#8C2F2F;color:#EFE6D8;text-decoration:none;
                  padding:12px 20px;border-radius:6px;font-size:14px;font-weight:600;">
          Upravljaj rezervacijo
        </a>
      </div>
    `
  );
}
