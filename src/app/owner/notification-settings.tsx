import { updateNotificationPreference } from "./actions";
import type { NotificationPreference, OwnerPlan } from "@/types/database.types";

const OPTIONS: { value: NotificationPreference; label: string; proOnly: boolean }[] = [
  { value: "off", label: "Izklopljeno", proOnly: false },
  { value: "daily", label: "Dnevni povzetek", proOnly: true },
  { value: "per_booking", label: "Vsaka rezervacija posebej", proOnly: true },
];

// Čist server component (brez "use client") - navaden radio + gumb "Shrani"
// ne potrebuje JS-a. "daily"/"per_booking" sta vidna VSEM, a onemogočena
// (in označena "FILLIO PRO") za free plan - strežniško preverjanje (glej
// updateNotificationPreference v ./actions.ts) je pravi gate, to je samo UI.
export default function NotificationSettings({
  current,
  plan,
}: {
  current: NotificationPreference;
  plan: OwnerPlan;
}) {
  const isPro = plan === "pro";

  return (
    <div className="border border-border rounded-lg bg-panel p-4 mb-8">
      <h2 className="text-sm font-medium text-cream-dim mb-3">Email obveščanje</h2>
      <form action={updateNotificationPreference} className="space-y-2">
        {OPTIONS.map((opt) => {
          const disabled = opt.proOnly && !isPro;
          return (
            <label
              key={opt.value}
              className={`flex items-center gap-2 text-sm ${
                disabled ? "text-cream-ghost cursor-not-allowed" : "text-cream cursor-pointer"
              }`}
            >
              <input
                type="radio"
                name="notification_preference"
                value={opt.value}
                defaultChecked={current === opt.value}
                disabled={disabled}
                className={disabled ? "cursor-not-allowed" : "cursor-pointer"}
              />
              {opt.label}
              {opt.proOnly && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gold text-ink font-semibold">
                  FILLIO PRO
                </span>
              )}
            </label>
          );
        })}
        <button
          type="submit"
          className="mt-2 text-xs px-3 py-1.5 rounded-md bg-burgundy text-on-accent font-medium cursor-pointer hover:opacity-90"
        >
          Shrani
        </button>
      </form>
      {!isPro && (
        <p className="mt-2 text-xs text-cream-faint">
          Dnevni povzetek in obveščanje ob vsaki rezervaciji sta na voljo z Fillio Pro.
        </p>
      )}
    </div>
  );
}
