"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type ServiceOption = { id: string; name: string; label: string; fits: boolean };

// Lasten spustni seznam namesto <select><option disabled style=...>...) -
// nativni <option> element ima zelo omejeno/nedosledno podporo za
// oblikovanje posameznih opcij med brskalniki (macOS Safari denimo večino
// CSS-a na <option> preprosto ignorira in vsili sistemsko izgled) - rdeča/
// onemogočena oznaka storitve, ki ne ustreza razpoložljivi vrzeli (glej
// manual-booking-form.tsx), bi bila zanesljivo vidna samo v NEKATERIH
// brskalnikih. Ta komponenta je POPOLNOMA pod našim CSS nadzorom.
export default function ServiceListbox({
  options,
  value,
  onChange,
}: {
  options: ServiceOption[];
  value: string;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const selected = options.find((o) => o.name === value);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full px-3 py-2 rounded-md border text-sm box-border bg-ink-field flex items-center justify-between gap-2 text-left cursor-pointer ${
          selected && !selected.fits ? "border-rose text-rose" : "border-border text-cream"
        }`}
      >
        <span className="truncate">{selected?.label ?? "Izberi storitev"}</span>
        <ChevronDown size={14} className="shrink-0 opacity-60" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-border bg-ink-elevated shadow-lg py-1"
        >
          {options.map((o) => (
            <li
              key={o.id}
              role="option"
              aria-selected={o.name === value}
              aria-disabled={!o.fits}
              onClick={() => {
                if (!o.fits) return;
                onChange(o.name);
                setOpen(false);
              }}
              className={`px-3 py-2 text-xs leading-snug ${
                !o.fits
                  ? "bg-rose/10 text-rose cursor-not-allowed"
                  : o.name === value
                    ? "bg-selected text-cream cursor-pointer"
                    : "text-cream cursor-pointer hover:bg-ink-soft"
              }`}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
