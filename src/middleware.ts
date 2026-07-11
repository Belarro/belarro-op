import { type NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/session';

const PUBLIC_ROUTES = ['/login', '/', '/order'];
// These API routes are public at the middleware level; each does its own
// auth inside the route where noted (shared secret and/or session).
// NOTE: this is ONE app now (admin + field) — the field pages are
// same-origin, so no CORS/sync-secret dance is needed for them.
const PUBLIC_API = ['/api/auth/login', '/api/contact', '/api/sync-sales-tracker', '/api/sync-prospect', '/api/send-followup-email', '/api/deliveries/due', '/api/deliveries/confirm', '/api/products/public'];

// What each role may reach. admin = everything. field = mobile field area +
// the APIs those pages call. farm = production/inventory (pages + APIs).
const FIELD_API_PREFIXES = [
  '/api/deliveries',
  '/api/field',
  '/api/follow-ups',
  '/api/locations',
  '/api/customers',
  '/api/auth',
];
const FARM_PAGE_PREFIXES = ['/admin/production', '/admin/inventory'];
const FARM_API_PREFIXES = ['/api/production', '/api/inventory', '/api/seeding', '/api/harvest', '/api/daily-operations', '/api/deliveries', '/api/auth'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ROUTES.includes(pathname) || PUBLIC_API.includes(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get('belarro_session')?.value;
  const session = token ? await verifySession(token) : null;
  const role = session?.role || (session ? 'admin' : null);

  // Field area (mobile app pages)
  if (pathname.startsWith('/field')) {
    if (!session) return NextResponse.redirect(new URL('/login', request.url));
    return NextResponse.next(); // any authenticated role may use the field app
  }

  // Admin pages
  if (pathname.startsWith('/admin')) {
    if (!session) return NextResponse.redirect(new URL('/login', request.url));
    if (role === 'admin') return NextResponse.next();
    if (role === 'farm' && FARM_PAGE_PREFIXES.some(p => pathname.startsWith(p))) return NextResponse.next();
    // field/farm users landing on admin pages go to the field home
    return NextResponse.redirect(new URL('/field', request.url));
  }

  // APIs
  if (pathname.startsWith('/api/')) {
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (role === 'admin') return NextResponse.next();
    if (role === 'field' && FIELD_API_PREFIXES.some(p => pathname.startsWith(p))) return NextResponse.next();
    if (role === 'farm' && FARM_API_PREFIXES.some(p => pathname.startsWith(p))) return NextResponse.next();
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.gif|.*\\.svg).*)',
  ],
};
