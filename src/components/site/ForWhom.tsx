export function ForWhom() {
  return (
    <section id="za-koga-je" className="bg-fillio-dark px-20 py-[140px]">
      <div className="mb-[26px] flex items-center gap-[10px]">
        <span className="block h-[6px] w-[22px] bg-white" />
        <span className="block h-[6px] w-[22px] bg-white" />
        <span className="block h-[6px] w-[22px] bg-fillio-tealDark" />
        <span className="block h-[6px] w-[22px] bg-fillio-tealLight" />
        <span className="ml-2 text-[13px] font-bold uppercase tracking-[1.5px] text-white/50">
          Za koga je
        </span>
      </div>

      <h2 className="mb-[22px] max-w-[780px] font-display text-[46px] font-semibold leading-[1.15] tracking-[-0.5px]">
        Fillio raste skupaj z vašo dejavnostjo.
      </h2>

      <p className="mb-[76px] max-w-[660px] text-lg leading-[1.65] text-white/60">
        Fillio danes rešuje rezervacije za frizerske in kozmetične salone, a to
        je šele začetek. Sistem hitro širimo na vsako dejavnost, ki živi od
        terminov — kmalu boste lahko v priljubljeni gostilni izbrali celo
        mizo, za katero želite sedeti, ne le termin večerje.
      </p>

      <div className="grid grid-cols-3 gap-7">
        {/* Frizerski salon */}
        <div className="flex flex-col rounded-md border border-white/[0.08] bg-[#17181B] p-9">
          <div className="mb-6 h-[6px] w-[34px] bg-fillio-tealDark" />
          <h3 className="mb-3.5 text-[23px] font-bold">Frizerski salon</h3>
          <p className="mb-6 text-[15px] leading-[1.6] text-white/55">
            Za vse, ki strankam urejajo frizure — ne glede na to, kakšen tip
            salona vodite.
          </p>
          <div className="mt-auto flex flex-col gap-2.5">
            {["Barbershop", "Ženski frizerski salon", "Univerzalni salon"].map(
              (item) => (
                <div
                  key={item}
                  className="rounded-[3px] border border-white/[0.12] px-3.5 py-2.5 text-sm font-semibold"
                >
                  {item}
                </div>
              )
            )}
            <div className="rounded-[3px] border border-dashed border-white/[0.28] px-3.5 py-2.5 text-sm font-semibold text-white/65">
              + Dodaj svojo storitev
            </div>
          </div>
        </div>

        {/* Kozmetični salon */}
        <div className="flex flex-col rounded-md border border-white/[0.08] bg-[#17181B] p-9">
          <div className="mb-6 h-[6px] w-[34px] bg-fillio-tealLight" />
          <h3 className="mb-3.5 text-[23px] font-bold">Kozmetični salon</h3>
          <p className="mb-6 text-[15px] leading-[1.6] text-white/55">
            Za salone lepote, ki ponujajo nego obraza, oblikovanje nohtov ali
            ličenje.
          </p>
          <div className="mt-auto flex flex-col gap-2.5">
            {["Nohtni studio", "Ličenje", "Nega obraza in telesa"].map((item) => (
              <div
                key={item}
                className="rounded-[3px] border border-white/[0.12] px-3.5 py-2.5 text-sm font-semibold"
              >
                {item}
              </div>
            ))}
            <div className="rounded-[3px] border border-dashed border-white/[0.28] px-3.5 py-2.5 text-sm font-semibold text-white/65">
              + Dodaj svojo storitev
            </div>
          </div>
        </div>

        {/* Coming soon */}
        <div className="flex flex-col rounded-md border border-dashed border-white/[0.22] p-9">
          <div className="mb-5 inline-flex w-fit rounded-[3px] border border-white/25 px-2.5 py-[5px] text-[11px] font-bold uppercase tracking-wider text-white/75">
            Kmalu
          </div>
          <h3 className="mb-3.5 text-[23px] font-bold text-white/85">
            Naslednje panoge so že v pripravi
          </h3>
          <p className="mb-6 text-[15px] leading-[1.6] text-white/50">
            Nabor podprtih dejavnosti bomo v prihodnjih mesecih razširili.
            Podrobnosti razkrijemo ob objavi vsake nove panoge.
          </p>
          <div className="mt-auto flex flex-col gap-2.5">
            {["Gostinstvo", "DJ-ji in dogodki", "In še več"].map((item) => (
              <div
                key={item}
                className="rounded-[3px] border border-white/10 px-3.5 py-2.5 text-sm font-semibold text-white/55"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
