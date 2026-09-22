"use client";

import { MessageCircle } from "lucide-react";
import { whatsAppLink } from "@/lib/constants";
import { sendWaitlistNotification } from "./actions";

type Entry = {
  id: string;
  customer_name: string;
  customer_phone: string;
  service_preference: string;
};

// Za VSAK vnos v splošni "Obvestila o prostem terminu" seznam (glej
// owner/page.tsx) - v nasprotju z WaitlistOffer (ki se prikaže SAMO pod
// pravkar odpovedanim terminom, z že vnaprej ujemajočimi kandidati), ta gumb
// ni vezan na konkreten sproščen termin - lastnik ga uporabi, kadar sam
// presodi, da je zdaj primeren trenutek za ponudbo. Klik odpre WhatsApp IN
// (če ima stranka na voljo e-pošto) sproži še sendWaitlistNotification -
// oboje ob ISTEM kliku, brez ločenega koraka.
export default function WaitlistNotifyButton({
  entry,
  bookingUrl,
}: {
  entry: Entry;
  bookingUrl: string;
}) {
  async function handleClick() {
    const serviceLine =
      entry.service_preference === "vseeno" ? "" : ` za ${entry.service_preference}`;
    const message = `Pozdravljen/a ${entry.customer_name}, morda se je sprostil termin${serviceLine} - preveri in rezerviraj: ${bookingUrl}`;
    window.open(whatsAppLink(entry.customer_phone, message), "_blank");
    await sendWaitlistNotification(entry.id);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="whitespace-nowrap flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-sage text-sage hover:bg-sage/10 cursor-pointer"
    >
      <MessageCircle size={13} /> Pošlji obvestilo
    </button>
  );
}
