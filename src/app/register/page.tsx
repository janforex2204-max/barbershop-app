import { redirect } from "next/navigation";

// Alias za nazaj združljivost - registracija je zdaj 4-koračni wizard na
// /owner/register (glej src/app/owner/register/page.tsx).
export default function RegisterRedirect() {
  redirect("/owner/register");
}
