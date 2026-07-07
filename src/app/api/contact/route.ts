import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';

/**
 * PUBLIC contact form endpoint for the marketing site (belarro.de).
 * - No auth (it is the public website form).
 * - CORS restricted to the allowed origins below.
 * - In-memory per-IP rate limiting (best-effort; resets on cold start).
 * - On success: creates a website lead + auto-schedules 5 follow-ups
 *   (Days 0/3/7/14/30) reusing belarro_v4_follow_up.
 */

const ALLOWED_ORIGINS = [
  'https://belarro.de',
  'https://www.belarro.de',
];

// Allow localhost during development.
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (process.env.NODE_ENV !== 'production' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
    return true;
  }
  return false;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = isAllowedOrigin(origin) ? origin! : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

// --- Best-effort in-memory rate limiter (per IP) ---------------------------
const RATE_LIMIT_MAX = 5;            // submissions
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // per hour
const hits = new Map<string, number[]>();

function getClientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (arr.length >= RATE_LIMIT_MAX) {
    hits.set(ip, arr);
    return true;
  }
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const headers = corsHeaders(origin);

  // CORS enforcement: reject cross-origin posts from disallowed origins.
  if (origin && !isAllowedOrigin(origin)) {
    return NextResponse.json(
      { success: false, error: 'Origin not allowed' },
      { status: 403, headers }
    );
  }

  const ip = getClientIp(request);
  if (rateLimited(ip)) {
    return NextResponse.json(
      { success: false, error: 'Too many requests. Please try again later.' },
      { status: 429, headers }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400, headers }
    );
  }

  const name = (body.name || '').toString().trim();
  const email = (body.email || '').toString().trim();
  const phone = (body.phone || '').toString().trim();
  const restaurant_name = (body.restaurant_name || '').toString().trim();
  const message = (body.message || '').toString().trim();

  // Validation: name required, and at least one contact channel.
  if (!name) {
    return NextResponse.json(
      { success: false, error: 'Name is required' },
      { status: 400, headers }
    );
  }
  if (!email && !phone) {
    return NextResponse.json(
      { success: false, error: 'Email or phone is required' },
      { status: 400, headers }
    );
  }
  if (email && !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { success: false, error: 'Invalid email address' },
      { status: 400, headers }
    );
  }
  // Cap field sizes to prevent abuse.
  if (name.length > 200 || message.length > 5000) {
    return NextResponse.json(
      { success: false, error: 'Input too long' },
      { status: 400, headers }
    );
  }

  try {
    const leadId = crypto.randomUUID();
    const created = await fetchFromSupabase('/belarro_v4_website_lead', {
      method: 'POST',
      body: JSON.stringify({
        id: leadId,
        name,
        email: email || null,
        phone: phone || null,
        restaurant_name: restaurant_name || null,
        message: message || null,
        source: 'website',
        status: 'new',
        ip_address: ip,
        user_agent: request.headers.get('user-agent') || null,
      }),
    });

    // Auto-schedule 5 follow-ups (Days 0/3/7/14/30) linked to the lead.
    const followUpDays = [0, 3, 7, 14, 30];
    for (let i = 0; i < followUpDays.length; i++) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + followUpDays[i]);
      await fetchFromSupabase('/belarro_v4_follow_up', {
        method: 'POST',
        body: JSON.stringify({
          id: crypto.randomUUID(),
          website_lead_id: leadId,
          customer_id: null,
          follow_up_number: i + 1,
          follow_up_days: followUpDays[i],
          due_date: dueDate.toISOString(),
          status: 'pending',
        }),
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: created ? created[0] : { id: leadId, name },
        message: 'Thank you. We will be in touch shortly.',
      },
      { status: 201, headers }
    );
  } catch (error) {
    console.error('Contact POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Could not submit your message. Please try again later.' },
      { status: 500, headers }
    );
  }
}
