"use client";

import { useRef, useState } from "react";
import { User } from "lucide-react";
import { uploadEmployeePhoto } from "./employees-actions";

// Ista omejitev kot bucket (glej "employee-photos" v supabase/schema.sql) -
// tu preverjena PREJ, na klientu, isti vzorec kot ./logo-upload.tsx.
const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export default function EmployeePhotoUpload({
  employeeId,
  initialPhotoUrl,
}: {
  employeeId: string;
  initialPhotoUrl: string | null;
}) {
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);
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

    const formData = new FormData();
    formData.set("file", file);
    const { url, error: uploadError } = await uploadEmployeePhoto(employeeId, formData);
    setUploading(false);

    if (uploadError) {
      setError(`Nalaganje ni uspelo: ${uploadError}`);
      return;
    }

    setPhotoUrl(url ?? null);
  }

  return (
    <div className="flex items-center gap-4">
      <div className="w-16 h-16 rounded-full border border-border bg-ink-field flex items-center justify-center overflow-hidden shrink-0">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- zunanja, dinamična Storage URL (ni lokalna slika), next/image bi zahteval remotePatterns za Supabase domeno
          <img src={photoUrl} alt="Slika zaposlenega" className="w-full h-full object-cover" />
        ) : (
          <User size={24} className="text-cream-faint" />
        )}
      </div>
      <div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="text-sm px-3 py-1.5 rounded-md border border-border text-cream hover:bg-ink-soft cursor-pointer disabled:opacity-60"
        >
          {uploading ? "Nalagam..." : photoUrl ? "Zamenjaj sliko" : "Naloži sliko"}
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
