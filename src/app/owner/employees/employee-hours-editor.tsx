"use client";

import { useState } from "react";
import DayHoursEditor from "@/components/day-hours-editor";
import type { SalonDayHours } from "@/types/database.types";
import { updateEmployeeHours } from "../employees-actions";

// Isti vzorec kot owner/hours/hours-editor-page.tsx, samo EN na zaposlenega
// namesto enega na salon - DayHoursEditor potrebuje lokalno (nadzorovano)
// stanje, zato je ločena client komponenta znotraj sicer server-rendered
// owner/employees/page.tsx.
export default function EmployeeHoursEditor({
  employeeId,
  initialHours,
}: {
  employeeId: string;
  initialHours: SalonDayHours[];
}) {
  const [hours, setHours] = useState<SalonDayHours[]>(initialHours);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | string>("idle");

  async function handleSave() {
    setSaving(true);
    setStatus("idle");
    const { error } = await updateEmployeeHours(employeeId, hours);
    setSaving(false);
    if (error) {
      setStatus(error);
      return;
    }
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 2500);
  }

  return (
    <div className="space-y-3">
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
