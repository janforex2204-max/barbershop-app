import { redirect } from "next/navigation";

// Alias za nazaj združljivost - novi wizard (glej /owner/register) uspešno
// registracijo prikaže sam (korak 4), ne prek posebne /success strani.
export default function RegisterSuccessRedirect() {
  redirect("/owner/register");
}
