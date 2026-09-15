import Image from "next/image";
import Link from "next/link";
import { PLATFORM_NAME } from "@/lib/constants";

// Skupna logotip komponenta (public/logo.png), da se velikost/stil ne
// razhajata med stranmi. width/height ustrezata dejanskemu razmerju stranic
// obrezane slike (3602x3020) - Next.js Image ju potrebuje za izračun
// aspect-ratio in preprečitev layout shifta, dejanska prikazana velikost pa
// je nadzorovana prek `size`.
//
// - "sm" (~16px, priglušen): majhna "powered by" značka - /register/success,
//   /reset-password, "ni odobren" kartica na /owner.
// - "lg" (~36px, poln): glavni logotip v zgornjem levem kotu - /, /register
//   IN /owner (dashboard) - vsepovsod dovolj velik, da je dejansko viden.
const SIZE_CLASSES = {
  sm: "h-4 w-auto opacity-60",
  lg: "h-9 w-auto",
} as const;

export default function PoweredBy({
  className = "",
  size = "sm",
  href,
}: {
  className?: string;
  size?: keyof typeof SIZE_CLASSES;
  href?: string;
}) {
  const image = (
    <Image
      src="/logo.png"
      alt={size === "lg" ? PLATFORM_NAME : `Powered by ${PLATFORM_NAME}`}
      width={3602}
      height={3020}
      priority={size === "lg"}
      className={`${SIZE_CLASSES[size]} ${className}`}
    />
  );

  return href ? (
    <Link href={href} aria-label={PLATFORM_NAME}>
      {image}
    </Link>
  ) : (
    image
  );
}
