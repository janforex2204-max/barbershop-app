"use client";

import { useState } from "react";
import DayHoursEditor, { defaultHours } from "@/components/day-hours-editor";
import type { SalonDayHours } from "@/types/database.types";
import { updateSalonHours } from "../actions";

// Ovito v ločeno client komponento, ker DayHoursEditor potrebuje lokalno
// stanje (nadzorovana komponenta) - stran sama (page.tsx) ostane Server
// Component, ki samo prebere trenutni urnik.
export default function HoursEditorPage({
  initialHours,
}: {
  initialHours: SalonDayHours[] | null;
}) {
  const [hours, setHours] = useState<SalonDayHours[]>(initialHours ?? defaultHours());
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | string>("idle");

  async function handleSave() {
    setSaving(true);
    setStatus("idle");
    const { error } = await updateSalonHours(hours);
    setSaving(false);
    if (error) {
      setStatus(error);
      return;
    }
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 2500);
  }

  return (
    <div className="space-y-4">
      <DayHoursEditor hours={hours} onChange={setHours} variant="app" />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="text-sm px-4 py-2 rounded-md bg-burgundy text-on-accent font-medium cursor-pointer hover:opacity-90 disabled:opacity-60"
        >
          {saving ? "Shranjujem..." : "Shrani urnik"}
        </button>
        {status === "saved" && <span className="text-sm text-sage">Shranjeno ✓</span>}
        {status !== "idle" && status !== "saved" && (
          <span className="text-sm text-rose">{status}</span>
        )}
      </div>
    </div>
  );
}
