"use client";

import { MessageCircle } from "lucide-react";
import { whatsAppLink } from "@/lib/constants";
import { markSmsSent } from "./actions";

type Offer = {
  id: string;
  recipient_name: string;
  recipient_phone: string;
  message: string;
};

// Prikaže se pod pravkar odpovedanim terminom, če cancelAppointment (glej
// ./actions.ts) zanj že najde ujemajoče čakajoče stranke - sporočilo je že
// pripravljeno (isto besedilo kot v NotificationsPanel "Ročno" zavihku), tu
// je samo bližnjica, da lastniku ni treba iskati po strani navzdol. Klik
// odpre WhatsApp IN označi isto sms_notifications vrstico kot poslano
// (markSmsSent), zato obvestilo izgine iz obeh mest hkrati.
export default function WaitlistOffer({ offers }: { offers: Offer[] }) {
  async function handleOffer(o: Offer) {
    window.open(whatsAppLink(o.recipient_phone, o.message), "_blank");
    await markSmsSent(o.id);
  }

  return (
    <div className="mx-4 mb-3 -mt-1 rounded-md border border-gold/30 bg-[#241E18] px-3 py-2.5">
      <p className="text-xs text-gold font-medium mb-2">
        Na čakalni listi za ta dan - ponudi sproščeni termin:
      </p>
      <div className="flex flex-col gap-1.5">
        {offers.map((o, i) => (
          <button
            key={o.id}
            type="button"
            onClick={() => handleOffer(o)}
            className="flex items-center justify-between gap-2 text-xs px-3 py-2 rounded border border-sage text-sage hover:bg-sage/10 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <MessageCircle size={13} /> Ponudi: {o.recipient_name}
            </span>
            {i === 0 && offers.length > 1 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gold text-ink font-semibold">
                PRVI V VRSTI
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
