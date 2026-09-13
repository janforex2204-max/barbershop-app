import { redirect } from "next/navigation";

// Alias za nazaj združljivost - primarna prijavna stran je zdaj "/".
export default async function OwnerLoginRedirect({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  redirect(error ? `/?error=${encodeURIComponent(error)}` : "/");
}
