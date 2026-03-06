import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";

const PUBLIC_ROUTES = new Set(["/login", "/register"]);

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/auth") || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(AUTH_SESSION_COOKIE)?.value;
  const isPublicRoute = PUBLIC_ROUTES.has(pathname);

  if (!sessionToken && !isPublicRoute) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
};
