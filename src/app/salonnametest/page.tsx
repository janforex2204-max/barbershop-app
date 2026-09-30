import { playfairDisplay } from "@/lib/fonts";

const NAME = "Barbershop Jan";

export default function SalonNameTest() {
  return (
    <div data-design="v2" className="min-h-screen bg-ink text-cream font-sans px-10 py-10 space-y-14">
      <div>
        <p className="text-xs text-cream-faint mb-2">A — Trenutna (za primerjavo): temen izrezljan 3D, mala/velika mešano</p>
        <p
          className={`${playfairDisplay.className} text-5xl font-black tracking-tight text-gold`}
          style={{
            textShadow: `
              1px 1px 0 color-mix(in srgb, var(--color-gold) 100%, black 25%),
              2px 2px 0 color-mix(in srgb, var(--color-gold) 100%, black 35%),
              3px 3px 0 color-mix(in srgb, var(--color-gold) 100%, black 45%),
              4px 4px 0 color-mix(in srgb, var(--color-gold) 100%, black 55%),
              6px 6px 10px rgba(0, 0, 0, 0.35)
            `,
          }}
        >
          {NAME}
        </p>
      </div>

      <div>
        <p className="text-xs text-cream-faint mb-2">B — Velike črke, SVETLEJŠA barva (gold-soft), lažji 3D (manj temnenja)</p>
        <p
          className={`${playfairDisplay.className} text-5xl font-black tracking-wide uppercase`}
          style={{
            color: "var(--color-gold-soft)",
            textShadow: `
              1px 1px 0 color-mix(in srgb, var(--color-gold-soft) 100%, black 15%),
              2px 2px 0 color-mix(in srgb, var(--color-gold-soft) 100%, black 22%),
              3px 3px 0 color-mix(in srgb, var(--color-gold-soft) 100%, black 30%),
              5px 5px 8px rgba(0, 0, 0, 0.25)
            `,
          }}
        >
          {NAME}
        </p>
      </div>

      <div>
        <p className="text-xs text-cream-faint mb-2">C — Velike črke, ZLAT PRELIV (gradient fill), mehka svetleča senca (brez temnenja)</p>
        <p
          className={`${playfairDisplay.className} text-5xl font-black tracking-wide uppercase`}
          style={{
            backgroundImage:
              "linear-gradient(135deg, var(--color-gold-soft) 0%, var(--color-gold) 45%, #f3d98a 55%, var(--color-gold) 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.4))",
          }}
        >
          {NAME}
        </p>
      </div>

      <div>
        <p className="text-xs text-cream-faint mb-2">D — Velike črke, KREMNA/bela polnitev + tanek zlat rob (svetlo, ne temno)</p>
        <p
          className={`${playfairDisplay.className} text-5xl font-black tracking-wide uppercase text-cream`}
          style={{
            WebkitTextStroke: "1.5px var(--color-gold)",
            textShadow: "0 3px 10px rgba(0,0,0,0.3)",
          }}
        >
          {NAME}
        </p>
      </div>

      <div>
        <p className="text-xs text-cream-faint mb-2">E — Velike črke, svetel zlat + mehak SIJ (glow) namesto globine</p>
        <p
          className={`${playfairDisplay.className} text-5xl font-black tracking-wide uppercase`}
          style={{
            color: "var(--color-gold-soft)",
            textShadow: `
              0 0 12px color-mix(in srgb, var(--color-gold-soft) 70%, transparent),
              0 0 28px color-mix(in srgb, var(--color-gold) 55%, transparent),
              0 2px 4px rgba(0,0,0,0.25)
            `,
          }}
        >
          {NAME}
        </p>
      </div>

      <div>
        <p className="text-xs text-cream-faint mb-2">F — Velike črke, lahek 3D kot A, a SVETLEJŠA osnova (gold-soft namesto gold)</p>
        <p
          className={`${playfairDisplay.className} text-5xl font-black tracking-wide uppercase`}
          style={{
            color: "var(--color-gold-soft)",
            textShadow: `
              1px 1px 0 color-mix(in srgb, var(--color-gold-soft) 100%, black 20%),
              2px 2px 0 color-mix(in srgb, var(--color-gold-soft) 100%, black 30%),
              3px 3px 6px rgba(0, 0, 0, 0.3)
            `,
          }}
        >
          {NAME}
        </p>
      </div>
    </div>
  );
}
