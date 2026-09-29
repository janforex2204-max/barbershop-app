"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { updateEmployeeColor } from "../employees-actions";
import { EMPLOYEE_COLOR_PALETTE } from "@/lib/week-layout";

// Majhna paleta (glej pogovor s Claude, item 4) - 6 nasičenih, med sabo
// razločljivih barv (glej --color-cal-1..6 v globals.css), namesto starega
// avtomatskega cikla po sort_order. null = ni si (še) izbral - koledar v
// tem primeru pade nazaj na cikel (glej resolveEmployeeColor v
// week-layout.ts), zato tu ni "privzeto izbrane" barve, dokler klikne.
export default function EmployeeColorPicker({
  employeeId,
  initialColor,
}: {
  employeeId: string;
  initialColor: string | null;
}) {
  const [color, setColor] = useState(initialColor);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(value: string) {
    if (value === color) return;
    setSaving(value);
    setError(null);
    const { error: saveError } = await updateEmployeeColor(employeeId, value);
    setSaving(null);
    if (saveError) {
      setError(saveError);
      return;
    }
    setColor(value);
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        {EMPLOYEE_COLOR_PALETTE.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => handlePick(value)}
            disabled={saving !== null}
            title="Izberi kot barvo termina v koledarju"
            className="w-6 h-6 rounded-full flex items-center justify-center cursor-pointer disabled:cursor-wait shrink-0"
            style={{
              background: value,
              boxShadow: color === value ? "0 0 0 2px var(--color-panel), 0 0 0 4px " + value : "none",
            }}
          >
            {color === value && <Check size={12} className="text-white" />}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-rose mt-1.5">{error}</p>}
    </div>
  );
}
