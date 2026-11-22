import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// The harness drives Claude Code on this Mac with permissions off, so only the owner may reach it.
// On this Mac (localhost) nothing is asked. From anywhere else (a tunnel), a request needs the
// cookie set by visiting /unlock?t=<HARNESS_TUNNEL_TOKEN> once on that device. The app listens on 127.0.0.1 only
// (package.json), so a device on the same Wi-Fi cannot reach it at all; a tunnel on this Mac is the way in.

const COOKIE = 'hh_auth';
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const PUBLIC = /^\/(favicon\.ico|manifest\.webmanifest|icons\/[\w.-]+\.(png|svg|ico))$/;

/** SHA-256 of a text, as hex: the key is compared and kept as this, never as itself, so a compare takes the same
 *  time whatever was typed and the cookie a device holds is not the key. */
async function digest(text: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
}
const cookieOf = (token: string) => digest(`hitchcock-harness device cookie\n${token}`);

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// A request that came through a tunnel or a proxy carries one of these; its Host can still read localhost, so it
// is never taken as this Mac (20 Nov 2026, the security audit of the public copy).
const FORWARDED = ['forwarded', 'cf-connecting-ip', 'cf-ray', 'tailscale-user-login', 'tailscale-funnel-request'];
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Next writes X-Forwarded-For with the address the request came from only when the sender has not written one, so
 *  this proves nothing about where a request came from: a sender can write 127.0.0.1 there. The app listens on
 *  127.0.0.1 only (package.json), so nothing off this Mac reaches it directly; this check catches a tunnel or a
 *  proxy on this Mac that passes the real address on. */
function viaElsewhere(request: NextRequest): boolean {
  if (FORWARDED.some((h) => request.headers.has(h))) return true;
  const xff = request.headers.get('x-forwarded-for');
  return !!xff && xff.split(',').some((a) => !LOOPBACK.has(a.trim()));
}
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Tailscale's own addresses: 100.64.0.0/10 and fd7a:115c:a1e0::/48. */
function tailnetAddress(a: string): boolean {
  const v4 = /^(?:::ffff:)?100\.(\d+)\.\d+\.\d+$/.exec(a);
  if (v4) return Number(v4[1]) >= 64 && Number(v4[1]) <= 127;
  return /^fd7a:115c:a1e0:/i.test(a);
}

/** Opt-in, off unless HARNESS_TAILNET_USERS names logins: a request that `tailscale serve` (your tailnet only) passed
 *  on from one of those logins needs no key. Tailscale writes who is asking (Tailscale-User-Login) and the tailnet
 *  address it came from (X-Forwarded-For); Funnel (the public internet) and any other tunnel or proxy still need the
 *  key, and so does a request whose forwarded address is not a tailnet one. */
function tailnetOwner(request: NextRequest): boolean {
  const allowed = (process.env.HARNESS_TAILNET_USERS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const user = request.headers.get('tailscale-user-login') ?? '';
  if (!allowed.length || !user || !allowed.includes(user)) return false;
  if (['forwarded', 'cf-connecting-ip', 'cf-ray', 'tailscale-funnel-request'].some((h) => request.headers.has(h))) return false;
  const xff = (request.headers.get('x-forwarded-for') ?? '').split(',').map((a) => a.trim()).filter(Boolean);
  return xff.length > 0 && xff.every(tailnetAddress);
}

/** A change asked for by another site: a page the user opens may POST to localhost (a text/plain body needs no
 *  preflight), so a request that changes anything is refused when the browser says it came from elsewhere. Scripts
 *  and Alma's own curl calls send neither header and pass. */
function crossSite(request: NextRequest): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site' || site === 'same-site') {
    // another site (or another app on localhost) may link to a page of the harness, and the link opens; anything
    // else it asks for is refused, a GET included: a GET can be fired by an <img> tag on any page
    const opensPage = request.headers.get('sec-fetch-mode') === 'navigate' && SAFE.has(request.method)
      && !request.nextUrl.pathname.startsWith('/api/');
    if (!opensPage) return true;
  }
  if (SAFE.has(request.method)) return false;
  if (site && site !== 'same-origin' && site !== 'none') return true;
  const origin = request.headers.get('origin');
  if (!origin) return false;
  let from = '';
  try { from = new URL(origin).host; } catch { return true; }
  const hosts = [request.headers.get('host'), request.headers.get('x-forwarded-host')].filter(Boolean);
  return !hosts.includes(from);
}

export async function proxy(request: NextRequest) {
  if (crossSite(request)) return new NextResponse('Hitchcock Harness: a change from another site is refused.', { status: 403 });
  const host = request.headers.get('host') ?? '';
  if (LOCAL.test(host) && !viaElsewhere(request)) return NextResponse.next();
  if (tailnetOwner(request)) return NextResponse.next();

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
    if (!same(await digest(t), await digest(token))) return new NextResponse('Wrong or missing key.', { status: 401 });
    const res = NextResponse.redirect(new URL('/', request.url));
    res.cookies.set(COOKIE, await cookieOf(token), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 90 });
    return res;
  }

  const c = request.cookies.get(COOKIE)?.value ?? '';
  if (same(c, await cookieOf(token))) return NextResponse.next();
  return new NextResponse('Hitchcock Harness: open the unlock link from the Mac once on this device.', { status: 401 });
}

export const config = {
  matcher: '/:path*',
};
