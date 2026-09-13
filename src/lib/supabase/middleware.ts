import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Osveži Supabase sejo (auth cookie) ob vsakem requestu in zavaruje /owner
// poti. "/" je primarna prijavna stran (glej src/app/page.tsx) - /owner/login
// je samo alias, ki nanjo preusmeri.
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
  // "/owner/login" ostane matchan tu samo zato, da vanj prijavljen uporabnik
  // (če ga kdo od zunaj še vedno obišče) takoj odskoči na /owner namesto da
  // gre skozi svojo lastno redirect-page logiko.
  const isLoginRoute = pathname === "/" || pathname === "/owner/login";

  if (isOwnerRoute && pathname !== "/owner/login" && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  if (isLoginRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/owner";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
