import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// The harness drives Claude Code on this Mac with permissions off, so only the owner may reach it.
// On this Mac (localhost) nothing is asked. From anywhere else (a tunnel), a request needs the
// cookie set by visiting /unlock?t=<HARNESS_TUNNEL_TOKEN> once on that device.

const COOKIE = 'hh_auth';
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const PUBLIC = /^\/(favicon\.ico|manifest\.webmanifest|icons\/[\w.-]+\.(png|svg|ico))$/;

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function proxy(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  if (LOCAL.test(host)) return NextResponse.next();

  const token = process.env.HARNESS_TUNNEL_TOKEN ?? '';
  if (token.length < 16) {
    return new NextResponse('Hitchcock Harness: remote access is off (no HARNESS_TUNNEL_TOKEN set on the Mac).', { status: 401 });
  }

  const url = request.nextUrl;
  // The logo is no secret, and a browser or a phone fetches it without the cookie (the tab icon, the home-screen
  // icon, the manifest): behind the key it showed as a placeholder (13 Nov 2026).
  if (PUBLIC.test(url.pathname)) return NextResponse.next();
  if (url.pathname === '/unlock') {
    const t = url.searchParams.get('t') ?? '';
    if (!same(t, token)) return new NextResponse('Wrong or missing key.', { status: 401 });
    const res = NextResponse.redirect(new URL('/', request.url));
    res.cookies.set(COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 90 });
    return res;
  }

  const c = request.cookies.get(COOKIE)?.value ?? '';
  if (same(c, token)) return NextResponse.next();
  return new NextResponse('Hitchcock Harness: open the unlock link from the Mac once on this device.', { status: 401 });
}

export const config = {
  matcher: '/:path*',
};
