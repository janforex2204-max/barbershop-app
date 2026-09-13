"use client";

import { useEffect } from "react";

// Ujame napake iz page.tsx (npr. začasna PostgREST/omrežna napaka pri
// razreševanju salona) - namenoma NI ista stvar kot prava 404 (not-found),
// ker tu salon obstaja, poizvedba pa je samo spodletela. Ponudi "poskusi
// znova" namesto trajne "stran ne obstaja".
export default function SalonPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink font-sans px-6">
      <div className="w-full max-w-sm border border-border rounded-lg p-6 space-y-4 text-center">
        <p className="text-sm text-cream">
          Prišlo je do začasne napake pri nalaganju strani.
        </p>
        <button
          onClick={reset}
          className="w-full rounded-md bg-burgundy text-cream text-sm font-semibold py-2.5 cursor-pointer"
        >
          Poskusi znova
        </button>
      </div>
    </div>
  );
}
