"use client";

import { useState } from "react";
import { Copy, Check, RefreshCw } from "lucide-react";
import { regenerateEmployeeScheduleToken } from "../employees-actions";
import { employeeScheduleUrl } from "@/lib/constants";

// "Kopiraj povezavo" (/moj-urnik/[token], glej pogovor s Claude) + "Ustvari
// nov link" (regenerateEmployeeScheduleToken - prepiše token, STAR link
// takoj preneha delovati, glej employees-actions.ts). Lokalen token state
// (ne čaka na revalidatePath) - isti vzorec kot LogoUpload/
// EmployeePhotoUpload, "Kopiraj" mora takoj po regeneraciji kopirati NOV
// link, ne starega iz prvotnega server-rendera.
export default function EmployeeScheduleLink({
  employeeId,
  initialToken,
}: {
  employeeId: string;
  initialToken: string;
}) {
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCopy() {
    setError(null);
    try {
      await navigator.clipboard.writeText(employeeScheduleUrl(token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Kopiranje ni uspelo - poskusi znova.");
    }
  }

  async function handleRegenerate() {
    if (
      !confirm(
        "Trenutna povezava bo takoj prenehala delovati in bo treba zaposlenemu poslati novo. Nadaljuj?"
      )
    ) {
      return;
    }
    setRegenerating(true);
    setError(null);
    const { token: newToken, error: regenError } = await regenerateEmployeeScheduleToken(employeeId);
    setRegenerating(false);

    if (regenError || !newToken) {
      setError(regenError ?? "Napaka pri ustvarjanju novega linka.");
      return;
    }
    setToken(newToken);
    setCopied(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border text-cream hover:bg-ink-soft cursor-pointer"
      >
        {copied ? (
          <>
            <Check size={13} /> Kopirano
          </>
        ) : (
          <>
            <Copy size={13} /> Kopiraj povezavo
          </>
        )}
      </button>
      <button
        type="button"
        onClick={handleRegenerate}
        disabled={regenerating}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border text-cream-dim hover:bg-ink-soft hover:text-cream cursor-pointer disabled:opacity-60"
      >
        <RefreshCw size={13} /> {regenerating ? "Ustvarjam..." : "Ustvari nov link"}
      </button>
      {error && <p className="text-xs text-rose basis-full">{error}</p>}
    </div>
  );
}
