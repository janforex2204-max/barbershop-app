"use client";

import { useState } from "react";
import Link from "next/link";

const featuresBasic = [
  "Rezervacije 24/7 preko vaše povezave",
  "Izbira storitve in izvajalca",
  "Neomejeno število strank",
  "Opomniki po WhatsAppu",
];

const featuresPro = [
  "Vse iz Osnovnega paketa",
  "Samodejni SMS opomniki",
  "Depoziti in plačila ob rezervaciji",
  "Opombe o strankah",
  "Prednostna podpora",
];

const featuresPremium = [
  "Vse iz Fillio Pro paketa",
  "Napredna analitika",
  "Več lokacij in ekip",
  "Namenska podpora",
];

export function Pricing() {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  const basicPrice = billing === "monthly" ? "25€" : "20€";
  const proPrice = billing === "monthly" ? "50€" : "40€";

  return (
    <section id="cenik" className="bg-fillio-dark px-20 py-[140px]">
      <div className="mb-[26px] flex items-center gap-[10px]">
        <span className="block h-[6px] w-[22px] bg-white" />
        <span className="block h-[6px] w-[22px] bg-white" />
        <span className="block h-[6px] w-[22px] bg-fillio-tealDark" />
        <span className="block h-[6px] w-[22px] bg-fillio-tealLight" />
        <span className="ml-2 text-[13px] font-bold uppercase tracking-[1.5px] text-white/50">
          Cenik
        </span>
      </div>

      <h2 className="mb-[22px] max-w-[780px] font-display text-[46px] font-semibold leading-[1.15] tracking-[-0.5px]">
        Preprost cenik, ki raste z vami.
      </h2>

      <p className="mb-10 max-w-[640px] text-lg leading-[1.65] text-white/60">
        Izberite paket, ki ustreza vašemu poslu. Nadgradite kadarkoli — brez
        vezave.
      </p>

      {/* billing toggle — actually functional */}
      <div className="mb-[50px] inline-flex items-center rounded border border-white/10 bg-[#17181B] p-1">
        <button
          type="button"
          onClick={() => setBilling("monthly")}
          className={`rounded-[3px] px-[22px] py-2.5 text-sm font-bold ${
            billing === "monthly" ? "bg-white/[0.08] text-white" : "text-white/50"
          }`}
        >
          Mesečno
        </button>
        <button
          type="button"
          onClick={() => setBilling("annual")}
          className={`flex items-center gap-2 rounded-[3px] px-[22px] py-2.5 text-sm font-bold ${
            billing === "annual" ? "bg-white/[0.08] text-white" : "text-white/50"
          }`}
        >
          Letno
          <span className="rounded-[3px] bg-fillio-tealLight px-[7px] py-[2px] text-[11px] font-bold text-fillio-dark">
            -20%
          </span>
        </button>
      </div>

      <div className="grid grid-cols-3 items-stretch gap-7">
        {/* OSNOVNI */}
        <div className="flex flex-col rounded-md border border-white/[0.08] bg-[#17181B] p-10">
          <div className="mb-[18px] text-sm font-bold uppercase tracking-wide text-white/55">
            Osnovni
          </div>
          <div className="mb-1.5 flex items-baseline gap-1.5">
            <span className="font-display text-[44px] font-semibold">{basicPrice}</span>
            <span className="text-[15px] text-white/50">/ mesec</span>
          </div>
          <p className="mb-1 text-sm text-white/50">Vse, kar potrebujete za urejen urnik.</p>
          {billing === "monthly" && (
            <p className="mb-7 text-[13px] text-white/35">Ali 20€/mesec z letno naročnino</p>
          )}
          {billing === "annual" && <div className="mb-7" />}

          <div className="mb-[34px] flex flex-col gap-3.5">
            {featuresBasic.map((f) => (
              <div key={f} className="flex items-start gap-2.5">
                <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 bg-white/40" />
                <span className="text-[15px] text-white/75">{f}</span>
              </div>
            ))}
          </div>

          <Link
            href="/owner/register"
            className="mt-auto rounded-[3px] border border-white/25 py-3.5 text-center text-[15px] font-bold text-white"
          >
            Registracija →
          </Link>
        </div>

        {/* PRO */}
        <div className="relative flex flex-col rounded-md border-2 border-fillio-tealLight bg-[#17181B] p-10">
          <div className="absolute -top-3.5 left-9 rounded-[3px] bg-fillio-tealLight px-3 py-[5px] text-[11px] font-bold uppercase tracking-wide text-fillio-dark">
            Priporočeno
          </div>
          <div className="mb-[18px] text-sm font-bold uppercase tracking-wide text-white/55">
            Fillio Pro
          </div>
          <div className="mb-1.5 flex items-baseline gap-1.5">
            <span className="font-display text-[44px] font-semibold">{proPrice}</span>
            <span className="text-[15px] text-white/50">/ mesec</span>
          </div>
          <p className="mb-1 text-sm text-white/50">Za salone, ki želijo popolno avtomatizacijo.</p>
          {billing === "monthly" && (
            <p className="mb-7 text-[13px] text-white/35">Ali 40€/mesec z letno naročnino</p>
          )}
          {billing === "annual" && <div className="mb-7" />}

          <div className="mb-[34px] flex flex-col gap-3.5">
            {featuresPro.map((f) => (
              <div key={f} className="flex items-start gap-2.5">
                <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 bg-fillio-tealLight" />
                <span className="text-[15px] text-white/85">{f}</span>
              </div>
            ))}
          </div>

          <Link
            href="/owner/register"
            className="mt-auto rounded-[3px] bg-fillio-tealLight py-3.5 text-center text-[15px] font-bold text-fillio-dark"
          >
            Registracija →
          </Link>
        </div>

        {/* PREMIUM — coming soon */}
        <div className="flex flex-col rounded-md border border-dashed border-white/[0.22] p-10">
          <div className="mb-[18px] inline-flex w-fit rounded-[3px] border border-white/25 px-2.5 py-[5px] text-[11px] font-bold uppercase tracking-wide text-white/75">
            V pripravi
          </div>
          <div className="mb-[18px] text-sm font-bold uppercase tracking-wide text-white/45">
            Premium
          </div>
          <div className="mb-1.5 flex items-baseline gap-1.5">
            <span className="font-display text-[32px] font-semibold text-white/60">Po dogovoru</span>
          </div>
          <p className="mb-7 text-sm text-white/45">Za gostinstvo in kompleksnejše dejavnosti.</p>

          <div className="mb-[34px] flex flex-col gap-3.5">
            {featuresPremium.map((f) => (
              <div key={f} className="flex items-start gap-2.5">
                <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 bg-white/30" />
                <span className="text-[15px] text-white/50">{f}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled
            className="mt-auto cursor-not-allowed rounded-[3px] border border-white/[0.18] py-3.5 text-[15px] font-bold text-white/60"
          >
            Obvestite me
          </button>
        </div>
      </div>

      <p className="mt-7 text-[13px] text-white/35">
        Letna naročnina se zaračuna vnaprej za celo leto. Mesečna naročnina se
        lahko kadarkoli prekliče, brez naknadnega obračuna.
      </p>
    </section>
  );
}
