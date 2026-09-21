import Link from "next/link";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* decorative watermark */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-40 select-none font-display text-[880px] font-semibold leading-none text-white/[0.035]"
      >
        F
      </div>

      <div className="relative z-10 flex min-h-[540px] items-center px-20 py-16">
        <div className="max-w-[700px]">
          {/* kicker: four bars, fill order matches the logo */}
          <div className="mb-[30px] flex items-center gap-[10px]">
            <span className="block h-[6px] w-[26px] bg-white" />
            <span className="block h-[6px] w-[26px] bg-white" />
            <span className="block h-[6px] w-[26px] bg-fillio-tealDark" />
            <span className="block h-[6px] w-[26px] bg-fillio-tealLight" />
            <span className="ml-1.5 text-[13px] font-bold uppercase tracking-[1.5px] text-white/50">
              Rezervacijski sistem za storitvene dejavnosti
            </span>
          </div>

          <h1 className="mb-7 font-display text-[66px] font-semibold leading-[1.08] tracking-[-0.5px]">
            Vaš posel si
            <br />
            zasluži poln urnik.
          </h1>

          <p className="mb-[42px] max-w-[540px] text-[19px] leading-[1.65] text-white/60">
            Fillio poskrbi za rezervacije namesto vas — brez klicev, brez
            izgubljenih strank in brez odvečnega administrativnega dela.
          </p>

          <div className="mb-[26px] flex items-center gap-5">
            <Link
              href="/owner/register"
              className="rounded-[3px] bg-fillio-tealLight px-[30px] py-[17px] text-base font-bold text-fillio-dark"
            >
              Registriraj se brezplačno →
            </Link>
            <Link
              href="/#kako-deluje"
              className="rounded-[3px] border border-white/[0.22] px-7 py-4 text-base font-semibold text-white"
            >
              Poglej, kako deluje
            </Link>
          </div>

          <div className="text-[13px] font-medium text-white/40">
            Brez kreditne kartice &nbsp;·&nbsp; Nastavitev v manj kot 10 minutah
          </div>
        </div>
      </div>
    </section>
  );
}
