const steps = [
  {
    n: "1",
    numColor: "text-fillio-dark/85",
    dotColor: "bg-fillio-dark/85",
    title: "Registracija in nastavitev profila",
    body: "Ustvarite račun v manj kot petih minutah. Vnesete osnovne podatke o svojem poslu — ime, naslov, delovni čas in kontaktne informacije — nato pa izberete vrsto dejavnosti, da vam Fillio takoj predlaga ustrezen nabor storitev.",
    chips: ["Brez kreditne kartice", "Odobritev v 24 urah", "Prilagodljivo kadarkoli"],
  },
  {
    n: "2",
    numColor: "text-fillio-dark/85",
    dotColor: "bg-fillio-dark/85",
    title: "Dodate storitve, cenik in ekipo",
    body: "Sestavite celoten cenik svojih storitev in določite trajanje vsake posebej. Če imate več zaposlenih ali izvajalcev, jih dodate v sistem, stranke pa lahko izbirajo, pri kom točno želijo termin.",
    chips: ["Neomejeno število storitev", "Ločeni urniki za zaposlene", "Urejanje v realnem času"],
  },
  {
    n: "3",
    numColor: "text-fillio-tealDark",
    dotColor: "bg-fillio-tealDark",
    title: "Prilagodite pravila rezervacij",
    body: "Določite, koliko vnaprej je mogoče rezervirati, koliko časa pustite med termini in ali za določene storitve zahtevate depozit ob rezervaciji. Vklopite samodejne opomnike, da stranke ne pozabijo na svoj termin.",
    chips: ["Samodejni WhatsApp / SMS opomniki", "Depoziti in politike odpovedi", "Opombe o strankah"],
  },
  {
    n: "4",
    numColor: "text-fillio-tealDark",
    dotColor: "bg-fillio-tealLight",
    title: "Delite povezavo in sprejemajte rezervacije 24/7",
    body: "Svojo unikatno rezervacijsko povezavo objavite v Instagram bio-ju, na spletni strani ali kjerkoli drugje. Stranke rezervirajo same, kadarkoli, sistem pa samodejno posodablja vaš urnik in preprečuje podvojene termine.",
    chips: ["Pregled v realnem času", "Brez podvojenih rezervacij", "Deluje na vsaki napravi"],
  },
];

export function HowItWorks() {
  return (
    <section id="kako-deluje" className="bg-fillio-light px-20 py-[140px] text-fillio-dark">
      <div className="mb-[26px] flex items-center gap-[10px]">
        <span className="block h-[6px] w-[22px] bg-fillio-dark" />
        <span className="block h-[6px] w-[22px] bg-fillio-dark" />
        <span className="block h-[6px] w-[22px] bg-fillio-tealDark" />
        <span className="block h-[6px] w-[22px] bg-fillio-tealLight" />
        <span className="ml-2 text-[13px] font-bold uppercase tracking-[1.5px] text-fillio-dark/50">
          Kako deluje
        </span>
      </div>

      <h2 className="mb-[22px] max-w-[780px] font-display text-[46px] font-semibold leading-[1.15] tracking-[-0.5px]">
        Vse, kar vaš posel potrebuje za urejen urnik — na enem mestu.
      </h2>

      <p className="mb-[90px] max-w-[640px] text-lg leading-[1.65] text-fillio-dark/60">
        Fillio ni le obrazec za rezervacije. Je celoten sistem za upravljanje
        vašega urnika, ekipe in strank — nastavljen natanko po meri vaše
        dejavnosti.
      </p>

      <div className="flex flex-col gap-14">
        {steps.map((step) => (
          <div key={step.n} className="grid grid-cols-[56px_1fr] gap-x-10">
            <div className="flex items-baseline gap-2">
              <div className={`font-sans text-[40px] font-extrabold leading-none ${step.numColor}`}>
                {step.n}
              </div>
              <div className={`h-[9px] w-[9px] ${step.dotColor}`} />
            </div>
            <div>
              <h3 className="mb-[14px] mt-1 text-2xl font-bold">{step.title}</h3>
              <p className="mb-[18px] max-w-[660px] text-[17px] leading-[1.65] text-fillio-dark/62">
                {step.body}
              </p>
              <div className="flex flex-wrap gap-[10px]">
                {step.chips.map((chip) => (
                  <div
                    key={chip}
                    className="rounded-[3px] border border-fillio-dark/15 bg-white px-3.5 py-2 text-[13px] font-semibold"
                  >
                    {chip}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
