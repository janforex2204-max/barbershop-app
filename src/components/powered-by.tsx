import Link from "next/link";
import { PLATFORM_NAME } from "@/lib/constants";
import FillioLogo from "./fillio-logo";

// Skupna logotip komponenta (FillioLogo - inline SVG, glej tam za razlago),
// da se velikost/stil ne razhajata med stranmi.
//
// - "sm" (~16px, priglušen): majhna "powered by" značka - /reset-password,
//   "ni odobren" kartica na /owner.
// - "lg" (~48px, poln): glavni logotip, poravnan na LEVI ROB CELE STRANI (ne
//   centriranega vsebinskega stolpca, glej klicna mesta) - /owner in vse
//   podstrani, /moj-urnik/[token].
const SIZE_CLASSES = {
  sm: "h-4 w-auto opacity-60",
  lg: "h-12 w-auto",
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
  const alt = size === "lg" ? PLATFORM_NAME : `Powered by ${PLATFORM_NAME}`;
  const image = <FillioLogo title={alt} className={`${SIZE_CLASSES[size]} ${className}`} />;

  return href ? (
    <Link href={href} aria-label={PLATFORM_NAME}>
      {image}
    </Link>
  ) : (
    image
  );
}
