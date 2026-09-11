"use client";

import { useState } from "react";
import { Bell, MessageCircle, Sparkles, Zap } from "lucide-react";
import { whatsAppLink } from "@/lib/constants";
import { markSmsSent } from "./actions";

type SmsLog = {
  id: string;
  recipient_name: string;
  recipient_phone: string;
  message: string;
  reason: "waitlist" | "earlier_slot";
};

export default function NotificationsPanel({ smsLog }: { smsLog: SmsLog[] }) {
  const [mode, setMode] = useState<"manual" | "auto">("manual");

  async function handleSend(log: SmsLog) {
    window.open(whatsAppLink(log.recipient_phone, log.message), "_blank");
    await markSmsSent(log.id);
  }

  return (
    <div>
      <h2 className="text-lg font-medium mb-3 flex items-center gap-2">
        <Bell size={18} className="text-gold" /> Obveščanje strank
      </h2>

      <div className="inline-flex gap-1 bg-ink-soft p-1 rounded-md mb-4">
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer transition-colors ${
            mode === "manual" ? "bg-burgundy text-cream" : "text-cream-dim hover:text-cream"
          }`}
        >
          Ročno
        </button>
        <button
          type="button"
          onClick={() => setMode("auto")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded cursor-pointer transition-colors ${
            mode === "auto" ? "bg-burgundy text-cream" : "text-cream-dim hover:text-cream"
          }`}
        >
          Avtomatsko
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gold text-ink font-semibold">
            KMALU
          </span>
        </button>
      </div>

      {mode === "manual" ? (
        <>
          <p className="text-xs text-cream-faint mb-3">
            Za vsako stranko pripravimo WhatsApp sporočilo - klikni, da ga
            odpreš in pošlješ.
          </p>
          <div className="border border-border rounded-lg divide-y divide-border-soft">
            {smsLog.length === 0 && (
              <p className="p-4 text-sm text-cream-dim">
                Ni aktivnih obvestil. Odpovej termin, da vidiš, kako sistem
                reagira.
              </p>
            )}
            {smsLog.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium">
                    {log.recipient_name}{" "}
                    <span className="text-xs text-gold ml-1.5">
                      {log.reason === "earlier_slot"
                        ? "zgodnejši termin"
                        : "želi termin"}
                    </span>
                  </div>
                  <div className="text-xs text-cream-faint mt-0.5">
                    {log.message}
                  </div>
                </div>
                <button
                  onClick={() => handleSend(log)}
                  className="whitespace-nowrap flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-sage text-sage hover:bg-sage/10 cursor-pointer"
                >
                  <MessageCircle size={13} /> Pošlji WhatsApp
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <AutoComingSoon />
      )}
    </div>
  );
}

function AutoComingSoon() {
  return (
    <div className="relative rounded-lg p-5 overflow-hidden border border-gold/40 bg-gradient-to-br from-[#2E2620] to-[#1B1815]">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={16} className="text-gold" />
        <span className="text-xs font-semibold tracking-wide text-gold uppercase">
          Premium funkcija · Kmalu na voljo
        </span>
      </div>
      <h3 className="font-display text-lg text-cream mb-1.5">
        Samodejno obveščanje strank
      </h3>
      <p className="text-sm text-cream-muted mb-4 max-w-md">
        Ob odpovedi termina sistem samodejno pošlje WhatsApp/SMS vsem
        ustreznim strankam - brez klikanja. Ti samo potrdiš, kdo je zapolnil
        termin.
      </p>

      <div className="flex items-center justify-between rounded-md border border-border bg-ink-field/60 px-4 py-3 mb-4 opacity-60 pointer-events-none select-none">
        <span className="text-sm text-cream">Samodejno pošiljanje</span>
        <span className="w-9 h-5 rounded-full bg-ink-soft border border-border relative">
          <span className="absolute left-0.5 top-0.5 w-3.5 h-3.5 rounded-full bg-cream-faint" />
        </span>
      </div>

      <ul className="space-y-1.5 mb-5 text-xs text-cream-faint">
        <li className="flex items-center gap-2">
          <Zap size={12} className="text-gold" /> Takojšnje obveščanje ob
          odpovedi, brez čakanja na lastnika
        </li>
        <li className="flex items-center gap-2">
          <Zap size={12} className="text-gold" /> Samodejno sledenje odgovorom
          strank
        </li>
        <li className="flex items-center gap-2">
          <Zap size={12} className="text-gold" /> Prednostni vrstni red glede
          na zvestobo stranke
        </li>
      </ul>

      <button
        type="button"
        disabled
        className="w-full py-2.5 rounded-md text-sm font-semibold text-ink cursor-not-allowed bg-gradient-to-r from-gold to-[#c99a52] opacity-70"
      >
        Kmalu na voljo
      </button>
    </div>
  );
}
