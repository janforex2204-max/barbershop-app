"use client";

import { useState } from "react";
import { MessageCircle, Mail, Check } from "lucide-react";
import { whatsAppLink } from "@/lib/constants";
import { sendWaitlistNotification } from "./actions";

type Entry = {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  service_preference: string;
};

// Za VSAK vnos v splošni "Obvestila o prostem terminu" seznam (glej
// owner/page.tsx) - v nasprotju z WaitlistOffer (ki se prikaže SAMO pod
// pravkar odpovedanim terminom, z že vnaprej ujemajočimi kandidati), ta gumb
// ni vezan na konkreten sproščen termin - lastnik ga uporabi, kadar sam
// presodi, da je zdaj primeren trenutek za ponudbo.
//
// Dva LOČENA gumba (namesto enega, ki bi odprl oboje naenkrat, glej pogovor
// s Claude) - "Pošlji WhatsApp" (odpre pripravljeno sporočilo, lastnik ga še
// vedno sam pošlje - klient, brez strežnika) in "Pošlji e-pošto" (dejansko
// pošlje TAKOJ prek Resend, s kratko vizualno potrditvijo) - slednji se
// sploh ne prikaže, če stranka e-pošte ni pustila.
export default function WaitlistNotifyButton({
  entry,
  bookingUrl,
  employeeName,
}: {
  entry: Entry;
  bookingUrl: string;
  // null = "vseeno kdo" (glej booking-page.tsx waitlist obrazec) - isti
  // null-pomeni-izpusti vzorec kot service_preference = "vseeno" spodaj.
  employeeName: string | null;
}) {
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [emailError, setEmailError] = useState<string | null>(null);

  function sendWhatsApp() {
    const serviceLine =
      entry.service_preference === "vseeno" ? "" : ` za ${entry.service_preference}`;
    const employeeLine = employeeName ? ` pri ${employeeName}` : "";
    const message = `Sprostil se je termin${serviceLine}${employeeLine} — preveri in rezerviraj: ${bookingUrl}`;
    window.open(whatsAppLink(entry.customer_phone, message), "_blank");
  }

  async function sendEmail() {
    setEmailStatus("sending");
    setEmailError(null);
    const { error } = await sendWaitlistNotification(entry.id);
    if (error) {
      setEmailStatus("idle");
      setEmailError(error);
      return;
    }
    setEmailStatus("sent");
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={sendWhatsApp}
          className="whitespace-nowrap flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-sage text-sage hover:bg-sage/10 cursor-pointer"
        >
          <MessageCircle size={13} /> Pošlji WhatsApp
        </button>
        {entry.customer_email && (
          <button
            type="button"
            onClick={sendEmail}
            disabled={emailStatus !== "idle"}
            className={`whitespace-nowrap flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border cursor-pointer disabled:cursor-default ${
              emailStatus === "sent"
                ? "border-sage text-sage"
                : "border-gold text-gold hover:bg-gold/10 disabled:opacity-60"
            }`}
          >
            {emailStatus === "sent" ? (
              <>
                <Check size={13} /> Poslano
              </>
            ) : (
              <>
                <Mail size={13} /> {emailStatus === "sending" ? "Pošiljam..." : "Pošlji e-pošto"}
              </>
            )}
          </button>
        )}
      </div>
      {emailError && <p className="text-[11px] text-rose">{emailError}</p>}
    </div>
  );
}
