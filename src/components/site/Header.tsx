import Link from "next/link";
import FillioLogo from "@/components/fillio-logo";

export function Header() {
  return (
    <header className="relative z-10 flex h-16 md:h-24 items-center justify-between border-b border-white/10 px-5 md:px-20">
      <Link href="/" className="shrink-0">
        <FillioLogo className="h-8 md:h-[46px] w-auto" />
      </Link>

      {/* Skrito pod md - na ozkem zaslonu px-20 + gap-11 + 4 povezave ne
          gredo v eno vrstico (glej pogovor s Claude - to je bil dejanski
          vzrok "čudnega loma"/tirkiznega gumba, potisnjenega izven roba).
          Namesto hamburger menija (nova JS/stanje komponenta) samo skrijemo
          sekundarno navigacijo - logotip + Prijava + Registracija so edino,
          kar mobilni obiskovalec res potrebuje takoj. */}
      <nav className="hidden md:flex items-center gap-11 text-[15px] font-medium text-white/70">
        <Link href="/#kako-deluje">Kako deluje?</Link>
        <Link href="/#za-koga-je">Za koga je?</Link>
        <Link href="/#cenik">Cenik</Link>
        <Link href="/#faq">FAQ</Link>
      </nav>

      <div className="flex items-center gap-3 md:gap-7">
        <Link
          href="/owner/login"
          className="cursor-pointer whitespace-nowrap text-sm md:text-[15px] font-semibold text-white/85"
        >
          Prijava
        </Link>
        <Link
          href="/owner/register"
          className="cursor-pointer whitespace-nowrap rounded-[3px] bg-fillio-tealLight px-3.5 md:px-[22px] py-2 md:py-3 text-xs md:text-sm font-bold text-fillio-dark"
        >
          Registracija
        </Link>
      </div>
    </header>
  );
}
