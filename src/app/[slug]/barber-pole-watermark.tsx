// Zelo bled, statičen vodni žig v ozadju - klasična rdeče-belo-modra spirala
// frizerskega droga, kot silhueta na sredini strani. SAMO za en konkreten
// salon (glej pogojni izris v booking-page.tsx: slug === "barbershop-pr-kljuni"),
// ne splošna platformska komponenta.
//
// "Bela" proga uporablja --watermark-neutral namesto trdega #fff, ker se
// pravi belina ob nizki opacity na SVETLEM ozadju (light tema) praktično
// izgubi - ta token se zato obrne z ostalimi temami (glej globals.css), tudi
// rdeča/modra sta nekoliko potemnjeni za svetlo temo, da vzorec ostane viden
// v OBEH temah, ne le v temni.
//
// POMEMBNO: "fixed", NE "absolute" - stran (veliko prostih terminov, dolg
// obrazec ...) je pogosto višja od enega zaslona. Z "absolute" bi se
// flex-centriranje spodaj nanašalo na CELOTNO (scrollable) višino strani,
// zato bi bil drog lahko sredi strani daleč pod vidnim delom zaslona ob
// nalaganju - videti bi bilo, kot da vodnega žiga sploh ni. "fixed" ga
// centrira v TRENUTNO VIDNEM oknu, ne glede na to, kje je uporabnik
// scrollan ali kako dolga je stran.
export default function BarberPoleWatermark() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none fixed inset-0 -z-10 flex items-center justify-center overflow-hidden"
    >
      <svg
        viewBox="0 0 300 900"
        className="h-[85vh] opacity-[0.12]"
        style={{ maxWidth: "60vw" }}
      >
        <defs>
          <pattern
            id="barber-pole-stripes"
            patternUnits="userSpaceOnUse"
            width="90"
            height="90"
            patternTransform="rotate(35)"
          >
            <rect width="90" height="90" style={{ fill: "var(--watermark-neutral)" }} />
            <rect width="30" height="90" style={{ fill: "var(--watermark-red)" }} />
            <rect x="60" width="30" height="90" style={{ fill: "var(--watermark-blue)" }} />
          </pattern>
        </defs>
        <rect
          x="60"
          y="0"
          width="180"
          height="900"
          rx="90"
          fill="url(#barber-pole-stripes)"
        />
      </svg>
    </div>
  );
}
