import Link from "next/link";
import Image from "next/image";

export function Header() {
  return (
    <header className="relative z-10 flex h-24 items-center justify-between border-b border-white/10 px-20">
      <Link href="/">
        <Image
          src="/logo.png"
          alt="Fillio"
          width={200}
          height={46}
          priority
          className="h-[46px] w-auto"
        />
      </Link>

      <nav className="flex items-center gap-11 text-[15px] font-medium text-white/70">
        <Link href="/#kako-deluje">Kako deluje?</Link>
        <Link href="/#za-koga-je">Za koga je?</Link>
        <Link href="/#cenik">Cenik</Link>
        <Link href="/#faq">FAQ</Link>
      </nav>

      <div className="flex items-center gap-7">
        <Link href="/owner/login" className="cursor-pointer text-[15px] font-semibold text-white/85">
          Prijava
        </Link>
        <Link
          href="/owner/register"
          className="cursor-pointer rounded-[3px] bg-fillio-tealLight px-[22px] py-3 text-sm font-bold text-fillio-dark"
        >
          Registracija
        </Link>
      </div>
    </header>
  );
}
