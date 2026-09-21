import Link from "next/link";
import Image from "next/image";

export function Footer() {
  return (
    <footer className="flex flex-col justify-between bg-fillio-dark px-20 pb-[50px] pt-20">
      <div className="flex items-start justify-between">
        <div className="max-w-[340px]">
          <Image
            src="/logo.png"
            alt="Fillio"
            width={180}
            height={40}
            className="mb-[22px] h-10 w-auto"
          />
          <p className="text-[15px] leading-[1.65] text-white/50">
            Rezervacijski sistem za frizerske in kozmetične salone — in kmalu
            še marsikaj drugega.
          </p>
        </div>

        <div className="flex gap-[90px]">
          <div>
            <div className="mb-5 text-[13px] font-bold uppercase tracking-wide text-white/40">
              Produkt
            </div>
            <div className="flex flex-col gap-[13px]">
              <Link href="/#kako-deluje" className="text-[15px] font-medium text-white/75">Kako deluje</Link>
              <Link href="/#za-koga-je" className="text-[15px] font-medium text-white/75">Za koga je</Link>
              <Link href="/#cenik" className="text-[15px] font-medium text-white/75">Cenik</Link>
              <Link href="/#faq" className="text-[15px] font-medium text-white/75">Pogosta vprašanja</Link>
            </div>
          </div>

          <div>
            <div className="mb-5 text-[13px] font-bold uppercase tracking-wide text-white/40">
              Podjetje
            </div>
            <div className="flex flex-col gap-[13px]">
              <Link href="/about" className="text-[15px] font-medium text-white/75">O nas</Link>
              <Link href="/contact" className="text-[15px] font-medium text-white/75">Kontakt</Link>
            </div>
          </div>

          <div>
            <div className="mb-5 text-[13px] font-bold uppercase tracking-wide text-white/40">
              Pravno
            </div>
            <div className="flex flex-col gap-[13px]">
              <Link href="/pogoji-uporabe" className="text-[15px] font-medium text-white/75">Pogoji uporabe</Link>
              <Link href="/zasebnost" className="text-[15px] font-medium text-white/75">Zasebnost</Link>
            </div>
          </div>

          <div>
            <div className="mb-5 text-[13px] font-bold uppercase tracking-wide text-white/40">
              Račun
            </div>
            <div className="flex flex-col gap-[13px]">
              <Link href="/owner/login" className="text-[15px] font-medium text-white/75">Prijava</Link>
              <Link
                href="/owner/register"
                className="w-fit rounded-[3px] bg-fillio-tealLight px-[18px] py-2.5 text-sm font-bold text-fillio-dark"
              >
                Registracija
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-7 h-px bg-white/[0.08]" />
        <div className="flex items-center justify-between">
          <div className="text-[13px] text-white/40">
            © {new Date().getFullYear()} Fillio. Vse pravice pridržane.
          </div>
          <div className="flex items-center gap-2">
            <span className="block h-[5px] w-[18px] bg-white" />
            <span className="block h-[5px] w-[18px] bg-white" />
            <span className="block h-[5px] w-[18px] bg-fillio-tealDark" />
            <span className="block h-[5px] w-[18px] bg-fillio-tealLight" />
          </div>
        </div>
      </div>
    </footer>
  );
}
