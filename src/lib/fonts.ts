import {
  Fraunces,
  Inter,
  Manrope,
  Cormorant_Garamond,
  Nunito_Sans,
  Playfair_Display,
} from "next/font/google";

// Deljeno med layout.tsx (postavi --font-* CSS spremenljivke na <html>, glej
// tam) in owner/page.tsx (uporabi fraunces.className NEPOSREDNO na imenu
// salona - glej pogovor s Claude, "večji, bolj premium naslov"). Next/font
// zahteva, da se klic zgodi na EDNEM, statično analizirljivem mestu - ta
// datoteka je TA vir, oba porabnika uvozita ISTI, že izračunan objekt (ne
// dva ločena klica iste pisave).
export const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Samo za marketinške strani (glej --font-marketing v globals.css) - app
// strani (prijava, nadzorna plošča ...) ostanejo pri Inter zgoraj.
export const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

// SAMO za spa temo (glej [data-theme="spa"] v globals.css, ki --font-fraunces/
// --font-inter LOKALNO prepiše na te dve - barber/privzeta temna tema
// ostane pri Fraunces/Inter zgoraj nedotaknjena, glej pogovor s Claude).
export const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// SAMO za ime salona na owner/page.tsx (glej pogovor s Claude - lastnik ni
// bil zadovoljen s Fraunces, "premium" izgled). Visoko-kontrasten,
// dramatičen serif, pogosto uporabljen za luksuzne/premium blagovne znamke -
// izstopa bolj kot mehkejši Fraunces. Brez `variable` (ni potreben CSS
// spremenljivkski preklop kot pri ostalih - samo playfairDisplay.className
// neposredno na enem mestu).
export const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
});
