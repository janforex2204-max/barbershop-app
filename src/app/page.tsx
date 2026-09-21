import type { Metadata } from "next";
import { Header } from "@/components/site/Header";
import { Hero } from "@/components/site/Hero";
import { HowItWorks } from "@/components/site/HowItWorks";
import { ForWhom } from "@/components/site/ForWhom";
import { Pricing } from "@/components/site/Pricing";
import { FAQ } from "@/components/site/FAQ";
import { Footer } from "@/components/site/Footer";

// Prijava za lastnike salonov je zdaj na /owner/login (glej middleware.ts).
export const metadata: Metadata = {
  title: "Fillio — Rezervacijski sistem za vaš posel",
  description:
    "Fillio je rezervacijski sistem za frizerske in kozmetične salone — brez klicev, brez izgubljenih strank.",
};

export default function HomePage() {
  return (
    <div className="bg-fillio-dark font-marketing text-white">
      <Header />
      <Hero />
      <HowItWorks />
      <ForWhom />
      <Pricing />
      <FAQ />
      <Footer />
    </div>
  );
}
