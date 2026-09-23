"use client";

import { useRef, useState } from "react";
import { Scissors } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateSalonLogo } from "./actions";

// Ista omejitev kot bucket (glej "salon-logos" v supabase/schema.sql) - tu
// preverjena PREJ, na klientu, da stranka dobi takojšen odgovor namesto
// šele po (počasnejšem) neuspelem nalaganju. Bucket-ova lastna omejitev
// (file_size_limit/allowed_mime_types) ostaja dokončna avtoriteta - ta
// klientska preverba je samo za boljšo izkušnjo, ne edina zaščita.
const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export default function LogoUpload({
  salonId,
  initialLogoUrl,
}: {
  salonId: string;
  initialLogoUrl: string | null;
}) {
  const [supabase] = useState(() => createClient());
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Omogoči ponovno izbiro ISTE datoteke (npr. po napaki) - brez tega
    // onChange ne bi sprožil, ker se value ne bi spremenil.
    e.target.value = "";
    if (!file) return;

    setError(null);

    const ext = EXT_BY_TYPE[file.type];
    if (!ext) {
      setError("Dovoljeni formati: PNG, JPEG ali WebP.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError("Datoteka je prevelika (največ 2 MB).");
      return;
    }

    setUploading(true);

    // "logo.<ext>" (ne izvirno ime datoteke) + upsert - vedno ISTA pot za
    // TA salon, zato nova nalaganja preprosto prepišejo prejšnjo (ni
    // osirotelih starih datotek). Storage RLS (glej schema.sql) dovoli
    // pisanje SAMO v mapo, ki se ujema s klicateljevim lastnim salon_id.
    const path = `${salonId}/logo.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("salon-logos")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      setUploading(false);
      setError("Nalaganje ni uspelo. Poskusi znova.");
      return;
    }

    const { data } = supabase.storage.from("salon-logos").getPublicUrl(path);
    // Cache-bust - pot je zaradi upsert vedno ista, brez tega bi brskalnik
    // (ali CDN) po zamenjavi logotipa lahko še vedno prikazoval STAREGA.
    const publicUrl = `${data.publicUrl}?v=${Date.now()}`;

    const { error: saveError } = await updateSalonLogo(publicUrl);
    setUploading(false);

    if (saveError) {
      setError(saveError);
      return;
    }

    setLogoUrl(publicUrl);
  }

  return (
    <div className="flex items-center gap-4">
      <div className="w-16 h-16 rounded-md border border-border bg-ink-field flex items-center justify-center overflow-hidden shrink-0">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- zunanja, dinamična Storage URL (ni lokalna slika), next/image bi zahteval remotePatterns za Supabase domeno
          <img src={logoUrl} alt="Logotip salona" className="w-full h-full object-cover" />
        ) : (
          <Scissors size={24} className="text-cream-faint" />
        )}
      </div>
      <div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="text-sm px-3 py-1.5 rounded-md border border-border text-cream hover:bg-ink-soft cursor-pointer disabled:opacity-60"
        >
          {uploading ? "Nalagam..." : logoUrl ? "Zamenjaj logotip" : "Naloži logotip"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFile}
          className="hidden"
        />
        <p className="text-xs text-cream-faint mt-1.5">PNG, JPEG ali WebP, do 2 MB.</p>
        {error && <p className="text-xs text-rose mt-1">{error}</p>}
      </div>
    </div>
  );
}
