import Image from "next/image";
import Link from "next/link";
import { PLATFORM_NAME } from "@/lib/constants";

// Skupna logotip komponenta (public/logo.png + public/logo-black.png), da se
// velikost/stil ne razhajata med stranmi IN da je logotip viden ne glede na
// trenutno temo (glej LogoImage spodaj - CSS preklopi med belim/črnim
// napisom, glej .logo-mark-white/.logo-mark-black v globals.css). width/
// height ustrezata dejanskemu razmerju stranic obrezane slike (3602x3020) -
// Next.js Image ju potrebuje za izračun aspect-ratio in preprečitev layout
// shifta, dejanska prikazana velikost pa je nadzorovana prek `size`.
//
// - "sm" (~16px, priglušen): majhna "powered by" značka - /reset-password,
//   "ni odobren" kartica na /owner.
// - "lg" (~36px, poln): glavni logotip v zgornjem levem kotu - /owner in vse
//   podstrani (hours, employees, services, login) - vsepovsod dovolj velik,
//   da je dejansko viden.
const SIZE_CLASSES = {
  sm: "h-4 w-auto opacity-60",
  lg: "h-9 w-auto",
} as const;

// Dve sliki, ena vedno skrita prek CSS (glej .logo-mark-white/.logo-mark-black
// v globals.css) - bel napis za temno ozadje, črn napis za svetlo (osebna
// svetla tema ALI vsiljena spa tema), oba brez ozadja/kvadrata (prava PNG
// prosojnost, preverjeno). Preklop je ČISTO CSS (isti selektorji kot vsak
// drug barvni žeton), ne JS/React state - zato pravilno sledi tudi vsiljeni
// spa temi, ne glede na osebno <html> nastavitev (glej pogovor s Claude).
function LogoImage({
  src,
  markClassName,
  alt,
  sizeClassName,
  className,
  priority,
}: {
  src: string;
  markClassName: string;
  alt: string;
  sizeClassName: string;
  className: string;
  priority: boolean;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={3602}
      height={3020}
      priority={priority}
      className={`${markClassName} ${sizeClassName} ${className}`}
    />
  );
}

export default function PoweredBy({
  className = "",
  size = "sm",
  href,
}: {
  className?: string;
  size?: keyof typeof SIZE_CLASSES;
  href?: string;
}) {
  const alt = size === "lg" ? PLATFORM_NAME : `Powered by ${PLATFORM_NAME}`;
  const image = (
    <>
      <LogoImage
        src="/logo.png"
        markClassName="logo-mark-white"
        alt={alt}
        sizeClassName={SIZE_CLASSES[size]}
        className={className}
        priority={size === "lg"}
      />
      <LogoImage
        src="/logo-black.png"
        markClassName="logo-mark-black"
        alt={alt}
        sizeClassName={SIZE_CLASSES[size]}
        className={className}
        priority={size === "lg"}
      />
    </>
  );

  return href ? (
    <Link href={href} aria-label={PLATFORM_NAME}>
      {image}
    </Link>
  ) : (
    image
  );
}
