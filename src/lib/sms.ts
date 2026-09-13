// Samodejno SMS obveščanje strank (Fillio Pro) - Twilio REST API, brez
// dodatnega "twilio" paketa (isti vzorec kot src/lib/email.ts z Resend).
// TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER (glej
// .env.local) trenutno NISO nastavljeni - dokler niso, isTwilioConfigured()
// vrne false in klicatelji (glej owner/actions.ts cancelAppointment) tiho
// padejo nazaj na obstoječi ROČNI WhatsApp-pošlji tok, brez napake.

export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER
  );
}

export async function sendSms(
  to: string,
  body: string
): Promise<{ ok: boolean; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return { ok: false, error: "Twilio ni konfiguriran." };
  }

  const params = new URLSearchParams({ To: to, From: fromNumber, Body: body });
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Twilio napaka (${res.status}): ${text}` };
  }

  return { ok: true };
}
