import Image from "next/image";
import { PLATFORM_NAME } from "@/lib/constants";

// Zamenjava za prejšnji besedilni napis "Powered by {PLATFORM_NAME}" - enak
// majhen, podrejen položaj (glej klicna mesta: /, /register, /register/success,
// /reset-password, /owner), samo z dejanskim logotipom (public/logo.png)
// namesto besedila. Skupna komponenta, da se velikost/stil ne razhajata med
// stranmi. width/height ustrezata dejanskemu razmerju stranic obrezane slike
// (3602x3020) - Next.js Image ju potrebuje za izračun aspect-ratio in
// preprečitev layout shifta, dejanska prikazana velikost pa je nadzorovana
// prek className (h-4 w-auto = ~16px visoko, širina se sama prilagodi).
export default function PoweredBy({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt={`Powered by ${PLATFORM_NAME}`}
      width={3602}
      height={3020}
      className={`h-4 w-auto opacity-60 ${className}`}
    />
  );
}
