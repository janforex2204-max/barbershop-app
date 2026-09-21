"use client";

import { useState } from "react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");

    // TODO: replace with a real API route, e.g. POST /api/contact,
    // which sends `form` via Resend to kontakt.fillio@gmail.com.
    // await fetch("/api/contact", { method: "POST", body: JSON.stringify(form) });

    setStatus("sent");
  }

  return (
    <div className="bg-fillio-dark font-marketing text-white">
      <Header />
      <section className="flex gap-[90px] px-20 py-[100px]">
        <div className="max-w-[460px]">
          <div className="mb-[26px] flex items-center gap-[10px]">
            <span className="block h-[6px] w-[22px] bg-white" />
            <span className="block h-[6px] w-[22px] bg-white" />
            <span className="block h-[6px] w-[22px] bg-fillio-tealDark" />
            <span className="block h-[6px] w-[22px] bg-fillio-tealLight" />
            <span className="ml-2 text-[13px] font-bold uppercase tracking-[1.5px] text-white/50">
              Kontakt
            </span>
          </div>

          <h1 className="mb-6 font-display text-[44px] font-semibold leading-[1.15] tracking-[-0.5px]">
            Radi bi slišali od vas.
          </h1>

          <p className="mb-10 text-[17px] leading-[1.65] text-white/60">
            Vprašanje o Fillio, predlog za nadgradnjo ali samo želite
            pokramljati o tem, kako bi lahko olajšali urnik vašega posla?
            Pišite nam.
          </p>

          <div className="flex flex-col gap-[22px]">
            <div>
              <div className="mb-1.5 text-[13px] font-bold uppercase tracking-wide text-white/40">
                E-pošta
              </div>
              <div className="text-[17px] font-semibold">kontakt@fillio.si</div>
            </div>
            <div>
              <div className="mb-1.5 text-[13px] font-bold uppercase tracking-wide text-white/40">
                Odzivni čas
              </div>
              <div className="text-[17px] font-semibold">
                Običajno v enem delovnem dnevu
              </div>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="max-w-[560px] flex-grow rounded-md border border-white/[0.08] bg-[#17181B] p-11"
        >
          <div className="flex flex-col gap-[22px]">
            <div>
              <label htmlFor="c-name" className="mb-2 block text-[13px] font-bold text-white/60">
                Ime in priimek
              </label>
              <input
                id="c-name"
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Janez Novak"
                className="w-full rounded-[3px] border border-white/15 bg-fillio-dark px-3.5 py-3 text-[15px] text-white placeholder:text-white/30"
              />
            </div>

            <div>
              <label htmlFor="c-email" className="mb-2 block text-[13px] font-bold text-white/60">
                E-poštni naslov
              </label>
              <input
                id="c-email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="ime@primer.si"
                className="w-full rounded-[3px] border border-white/15 bg-fillio-dark px-3.5 py-3 text-[15px] text-white placeholder:text-white/30"
              />
            </div>

            <div>
              <label htmlFor="c-msg" className="mb-2 block text-[13px] font-bold text-white/60">
                Sporočilo
              </label>
              <textarea
                id="c-msg"
                rows={5}
                required
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Kako vam lahko pomagamo?"
                className="w-full resize-none rounded-[3px] border border-white/15 bg-fillio-dark px-3.5 py-3 text-[15px] text-white placeholder:text-white/30"
              />
            </div>

            <button
              type="submit"
              disabled={status === "sending"}
              className="rounded-[3px] bg-fillio-tealLight py-[15px] text-[15px] font-bold text-fillio-dark disabled:opacity-60"
            >
              {status === "sent" ? "Poslano ✓" : "Pošlji sporočilo →"}
            </button>
          </div>
        </form>
      </section>
      <Footer />
    </div>
  );
}
