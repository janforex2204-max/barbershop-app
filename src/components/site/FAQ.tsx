const faqs = [
  {
    q: "Ali potrebujem kreditno kartico za registracijo?",
    a: "Ne. Registracija in Osnovni pregled sistema sta brez obveznosti. Podatke za plačilo vnesete šele, ko se odločite za nadgradnjo.",
  },
  {
    q: "Koliko časa traja odobritev salona?",
    a: "Vaš profil pregledamo in odobrimo v manj kot 24 urah, običajno bistveno hitreje.",
  },
  {
    q: "Ali lahko kadarkoli prekličem naročnino?",
    a: "Pri mesečni naročnini da, kadarkoli in brez naknadnega obračuna. Letna naročnina se zaračuna vnaprej za celo leto in ob predčasni prekinitvi ni vračila za preostale mesece.",
  },
  {
    q: "Kaj se zgodi ob nadgradnji na Fillio Pro?",
    a: "Nadgradnja je takojšnja. Vsi vaši podatki, storitve in rezervacije ostanejo, dodate pa SMS opomnike, depozite in opombe o strankah.",
  },
  {
    q: "Ali Fillio deluje na mobilnem telefonu?",
    a: "Da. Tako vaša nadzorna plošča kot rezervacijska stran za stranke delujeta na vsaki napravi.",
  },
  {
    q: "Ali potrebujem svojo spletno stran?",
    a: "Ne. Svojo edinstveno rezervacijsko povezavo delite kjerkoli — v Instagram bio-ju, na Facebooku ali neposredno strankam.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="bg-fillio-light px-20 py-[140px] text-fillio-dark">
      <div className="mb-[26px] flex items-center gap-[10px]">
        <span className="block h-[6px] w-[22px] bg-fillio-dark" />
        <span className="block h-[6px] w-[22px] bg-fillio-dark" />
        <span className="block h-[6px] w-[22px] bg-fillio-tealDark" />
        <span className="block h-[6px] w-[22px] bg-fillio-tealLight" />
        <span className="ml-2 text-[13px] font-bold uppercase tracking-[1.5px] text-fillio-dark/50">
          Pogosta vprašanja
        </span>
      </div>

      <h2 className="mb-[70px] max-w-[780px] font-display text-[46px] font-semibold leading-[1.15] tracking-[-0.5px]">
        Vprašanja, ki jih dobimo največkrat.
      </h2>

      <div className="grid grid-cols-2 gap-x-16 gap-y-11">
        {faqs.map((item) => (
          <div key={item.q} className="border-b border-fillio-dark/10 pb-[30px]">
            <h3 className="mb-2.5 text-[19px] font-bold">{item.q}</h3>
            <p className="text-[15px] leading-[1.6] text-fillio-dark/60">{item.a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
