import { updateNotificationPreference } from "./actions";
import type { NotificationPreference } from "@/types/database.types";

const OPTIONS: { value: NotificationPreference; label: string }[] = [
  { value: "off", label: "Izklopljeno" },
  { value: "daily", label: "Dnevni povzetek" },
  { value: "per_booking", label: "Vsaka rezervacija posebej" },
];

// Čist server component (brez "use client") - navaden radio + gumb "Shrani"
// ne potrebuje JS-a. Vse tri opcije so na voljo VSEM planom - Resend email
// ne stane nič bistvenega (glej updateNotificationPreference v ./actions.ts,
// ki prej "daily"/"per_booking" prisilno prepisal na "off" za free plan;
// isti razlog kot zaposleni, ki so prav tako brez plan omejitve). Za razliko
// od tega SMS/WhatsApp avtomatsko obveščanje (glej notifications-panel.tsx)
// OSTAJA Fillio Pro - Twilio SMS ima pravo stroškovno osnovo, Resend je.
export default function NotificationSettings({
  current,
}: {
  current: NotificationPreference;
}) {
  return (
    <div className="border border-border rounded-lg bg-panel p-4 mb-8">
      <h2 className="text-sm font-medium text-cream-dim mb-3">Email obveščanje</h2>
      <form action={updateNotificationPreference} className="space-y-2">
        {OPTIONS.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 text-sm text-cream cursor-pointer">
            <input
              type="radio"
              name="notification_preference"
              value={opt.value}
              defaultChecked={current === opt.value}
              className="cursor-pointer"
            />
            {opt.label}
          </label>
        ))}
        <button
          type="submit"
          className="mt-2 text-xs px-3 py-1.5 rounded-md bg-burgundy text-on-accent font-medium cursor-pointer hover:opacity-90"
        >
          Shrani
        </button>
      </form>
    </div>
  );
}
