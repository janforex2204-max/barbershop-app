import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";

export default function AboutPage() {
  return (
    <div className="bg-fillio-dark font-marketing text-white">
      <Header />
      <section className="px-20 py-[100px]">
        <div className="mb-[26px] flex items-center gap-[10px]">
          <span className="block h-[6px] w-[22px] bg-white" />
          <span className="block h-[6px] w-[22px] bg-white" />
          <span className="block h-[6px] w-[22px] bg-fillio-tealDark" />
          <span className="block h-[6px] w-[22px] bg-fillio-tealLight" />
          <span className="ml-2 text-[13px] font-bold uppercase tracking-[1.5px] text-white/50">
            O nas
          </span>
        </div>

        <h1 className="mb-10 max-w-[780px] font-display text-[48px] font-semibold leading-[1.15] tracking-[-0.5px]">
          Fillio je nastal iz resnične težave enega salona.
        </h1>

        <div className="flex gap-20">
          <div className="max-w-[640px]">
            <p className="mb-[22px] text-[17px] leading-[1.7] text-white/65">
              Vse se je začelo z enim samim salonom, ki se je vsak dan
              spopadal z istimi težavami: zamujenimi termini, telefonskimi
              klici sredi stranke in urnikom, ki je živel na papirju in v
              glavi lastnika. Rešitve, ki so obstajale, so bile predrage,
              prekomplicirane ali preprosto niso razumele, kako slovenski
              saloni dejansko delajo.
            </p>
            <p className="mb-[22px] text-[17px] leading-[1.7] text-white/65">
              Zato smo zgradili Fillio — preprost, zanesljiv rezervacijski
              sistem, ki dela zate 24 ur na dan, ne glede na to, ali strižeš,
              barvaš, oblikuješ nohte ali ličiš. Danes ga uporabljajo
              frizerski in kozmetični saloni, v prihodnje pa ga gradimo za
              vsak posel, ki živi od terminov.
            </p>
            <p className="text-[17px] leading-[1.7] text-white/65">
              Naša filozofija je preprosta: tehnologija naj bo nevidna, čas pa
              naj ostane vaš.
            </p>
          </div>

          <div className="flex min-w-[280px] flex-col gap-7">
            <div className="border-t-2 border-fillio-tealLight pt-4">
              <div className="mb-1.5 text-[17px] font-bold">Preprostost</div>
              <div className="text-sm leading-[1.6] text-white/50">
                Nič odvečnega. Le tisto, kar salon dejansko potrebuje.
              </div>
            </div>
            <div className="border-t-2 border-fillio-tealDark pt-4">
              <div className="mb-1.5 text-[17px] font-bold">Zanesljivost</div>
              <div className="text-sm leading-[1.6] text-white/50">
                Vaš urnik teče brez izpadov, ob vsaki uri dneva.
              </div>
            </div>
            <div className="border-t-2 border-white/50 pt-4">
              <div className="mb-1.5 text-[17px] font-bold">Rast z vami</div>
              <div className="text-sm leading-[1.6] text-white/50">
                Sistem se širi skupaj z vašim poslom, ne obratno.
              </div>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
