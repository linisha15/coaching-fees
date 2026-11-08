import { NextResponse, type NextRequest } from "next/server";

/**
 * Fast first gate: no session cookie → real 307 to /login before anything
 * renders. This is NOT the authorization check — every page, action and API
 * route still validates the session, role and ownership against the DB.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("session")) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/parent/:path*", "/accounts/:path*", "/pay/:path*", "/receipt/:path*", "/consent"],
};
