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
export default function BarberPoleWatermark() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden"
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
