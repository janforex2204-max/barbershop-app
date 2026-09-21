import type { Metadata } from "next";
import { Fraunces, Inter, Manrope } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

// Teče sinhrono, PREDEN se React sploh naloži/hidrira - prepreči "flash"
// napačne teme ob nalaganju strani. Shranjena izbira (localStorage) ima
// prednost; ob prvem obisku (brez shranjene izbire) uporabi sistemsko
// prefers-color-scheme. ThemeProvider (client komponenta) kasneje samo
// PREBERE to že nastavljeno stanje - glej src/components/theme-provider.tsx.
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("fillio-theme");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();
`;

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Samo za marketinške strani (glej --font-marketing v globals.css) - app
// strani (prijava, nadzorna plošča ...) ostanejo pri Inter zgoraj.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Fillio — rezervacije",
  description: "Rezervacijski sistem za frizerske salone",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="sl"
      suppressHydrationWarning
      className={`${fraunces.variable} ${inter.variable} ${manrope.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans min-h-full flex flex-col bg-ink text-cream">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
