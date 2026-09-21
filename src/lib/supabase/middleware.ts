import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Osveži Supabase sejo (auth cookie) ob vsakem requestu in zavaruje /owner
// poti. "/" je zdaj marketinška domača stran (glej src/app/page.tsx) -
// prijava je na /owner/login, registracija pa na /owner/register (oba JAVNA,
// zato izrecno izvzeta iz spodnjega /owner guarda).
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isOwnerRoute = pathname.startsWith("/owner");
  // Javne /owner poti - dostopne BREZ prijave (nasprotje vsega ostalega pod
  // /owner, npr. /owner ali /owner/services, ki so nadzorna plošča).
  const isPublicOwnerRoute =
    pathname === "/owner/login" || pathname.startsWith("/owner/register");
  const isLoginRoute = pathname === "/owner/login";

  if (isOwnerRoute && !isPublicOwnerRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/owner/login";
    return NextResponse.redirect(url);
  }

  if (isLoginRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/owner";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
