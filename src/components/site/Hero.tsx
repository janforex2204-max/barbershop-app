import Link from "next/link";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* decorative watermark - manjši na mobilnem (cenejše za izris),
          section ohrani overflow-hidden zgoraj, torej nikoli ne uide iz
          okvirja ne glede na širino. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-40 select-none font-display text-[280px] md:text-[880px] font-semibold leading-none text-white/[0.035]"
      >
        F
      </div>

      {/* min-h-[540px] SAMO od md navzgor - na nizkih mobilnih zaslonih je
          to prisililo CTA gumbe skoraj na sam spodnji rob, kjer jih je
          prekrila brskalnikova vrstica (glej pogovor s Claude). pb-[max(...)]
          doda pravi spodnji varnostni razmik (env(safe-area-inset-bottom) -
          gesture bar/home indicator na novejših telefonih), min 3rem tudi
          brez safe-area podpore. */}
      <div className="relative z-10 flex min-h-0 md:min-h-[540px] items-center px-5 pt-14 pb-[max(3rem,env(safe-area-inset-bottom))] md:px-20 md:py-16">
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

          <h1 className="mb-7 font-display text-[36px] md:text-[66px] font-semibold leading-[1.15] md:leading-[1.08] tracking-[-0.5px]">
            Vaš posel si
            <br />
            zasluži poln urnik.
          </h1>

          <p className="mb-[42px] max-w-[540px] text-base md:text-[19px] leading-[1.65] text-white/60">
            Fillio poskrbi za rezervacije namesto vas — brez klicev, brez
            izgubljenih strank in brez odvečnega administrativnega dela.
          </p>

          {/* Sklad na mobilnem (dva gumba drug ob drugem sta se prej stiskala/
              prekrivala z robom) - v vrsto šele od sm navzgor. */}
          <div className="mb-[26px] flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-5">
            <Link
              href="/owner/register"
              className="rounded-[3px] bg-fillio-tealLight px-[30px] py-[17px] text-center text-base font-bold text-fillio-dark"
            >
              Registriraj se brezplačno →
            </Link>
            <Link
              href="/#kako-deluje"
              className="rounded-[3px] border border-white/[0.22] px-7 py-4 text-center text-base font-semibold text-white"
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
