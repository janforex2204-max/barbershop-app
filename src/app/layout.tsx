import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "Fillio — rezervacije",
  description: "Rezervacijski sistem za frizerske salone",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="sl"
      className={`${fraunces.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="font-sans min-h-full flex flex-col bg-ink text-cream">
        {children}
      </body>
    </html>
  );
}
