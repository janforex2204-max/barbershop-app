import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Oseben PWA manifest za TA konkreten /moj-urnik/[token] - Next.js
// manifest.(json|ts) posebna datotečna konvencija (glej src/app/manifest
// primerjalno v pogovoru s Claude) je po dokumentaciji SAMO za koren app/,
// ne podpira gnezdenih dinamičnih segmentov/params, zato tu navaden Route
// Handler z enako obliko odgovora (ista ikona kot /owner - glej pogovor s
// Claude, "isti vzorec"). start_url/scope sta vezana na TA token, da
// "Dodaj na domači zaslon" znova odpre PRAVILEN zaposlenov urnik, ne
// generične strani.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: employee } = await admin
    .from("employees")
    .select("name")
    .eq("schedule_token", token)
    .maybeSingle();

  const name = employee ? `${employee.name} — urnik` : "Moj urnik";

  return NextResponse.json(
    {
      name,
      short_name: "Moj urnik",
      description: "Tvoji prihodnji termini",
      start_url: `/moj-urnik/${token}`,
      scope: `/moj-urnik/${token}`,
      display: "standalone",
      orientation: "portrait-primary",
      background_color: "#101113",
      theme_color: "#101113",
      lang: "sl",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        {
          src: "/icons/icon-192-maskable.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "maskable",
        },
        {
          src: "/icons/icon-512-maskable.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } }
  );
}
