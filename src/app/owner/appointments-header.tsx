"use client";

import { useState } from "react";
import ManualBookingForm from "./manual-booking-form";

// Naslov "Termini za ..." in gumb za ročni vnos morata vedno ostati v svoji
// vrstici (fiksne širine) - sam obrazec (ko je odprt) se izriše kot ločen
// blok POD to vrstico, ne kot flex sosed naslova (zato se naslov prej ni stisnil).
export default function AppointmentsHeader({
  title,
  initialDate,
  salonId,
}: {
  title: string;
  initialDate: string;
  salonId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-medium capitalize">{title}</h2>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-sm border border-border rounded-md px-3 py-1.5 hover:bg-ink-soft cursor-pointer"
          >
            + Dodaj termin ročno
          </button>
        )}
      </div>

      {open && (
        <ManualBookingForm
          initialDate={initialDate}
          salonId={salonId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
