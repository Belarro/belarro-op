import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { verifySession } from '@/lib/session';

const getFlyerUrls = () => {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!SUPABASE_URL) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
  }
  return {
    en: `${SUPABASE_URL}/storage/v1/object/public/assets/flyers/flyer-en.png`,
    de: `${SUPABASE_URL}/storage/v1/object/public/assets/flyers/flyer-de.png`,
  };
};

// Plain SMTP via a Gmail App Password — replaces the old OAuth flow, whose
// refresh tokens expired every 7 days while the Cloud Console app sat in
// "Testing" publishing status. An App Password never expires and needs no
// reconnecting, no Settings page, no token table.
function getTransport() {
  const user = process.env.GMAIL_SMTP_USER;
  const pass = process.env.GMAIL_SMTP_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error('Email not configured. Set GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD.');
  }
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

function buildHtml(body: string, flyerUrl: string): string {
  const htmlBody = body
    .split('\n')
    .map(line => line.trim() === '' ? '<br>' : `<p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:15px;color:#222;">${line}</p>`)
    .join('\n');

  return [
    `<html><body style="max-width:600px;margin:0 auto;padding:20px;">`,
    htmlBody,
    `<br>`,
    `<img src="${flyerUrl}" alt="Belarro Microgreens" style="width:100%;max-width:600px;display:block;border:0;" />`,
    `</body></html>`,
  ].join('\n');
}

export async function POST(request: NextRequest) {
  // CORS: only allow specific origins
  const origin = request.headers.get('origin') || '';
  const ALLOWED_ORIGINS = [
    'https://belarro.de',
    'https://www.belarro.de',
    process.env.SALETRACKER_URL || 'https://sales.belarro.com',
  ];

  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : '';
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
  };

  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Auth: admin session cookie (web UI) OR shared secret (SalesTracker app).
    // This endpoint sends email from Ron's Gmail — it must never be open.
    const cookieToken = request.cookies.get('belarro_session')?.value;
    const session = cookieToken ? await verifySession(cookieToken) : null;
    const syncSecret = process.env.SALETRACKER_SYNC_SECRET || '';
    const headerSecret = request.headers.get('x-sync-secret');
    if (!session && (!syncSecret || headerSecret !== syncSecret)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const { to, subject, body, language } = await request.json();

    if (!to || !subject || !body) {
      return NextResponse.json({ error: 'Missing required fields: to, subject, body' }, { status: 400 });
    }

    const flyers = getFlyerUrls();
    const flyerUrl = (language || '').toUpperCase() === 'EN' ? flyers.en : flyers.de; // default DE
    const html = buildHtml(body, flyerUrl);

    const transport = getTransport();
    await transport.sendMail({
      from: `"Belarro Microgreens" <${process.env.GMAIL_SMTP_USER}>`,
      to,
      subject,
      text: body,
      html,
    });

    // Do NOT auto-log — user may still want to send WhatsApp too.
    // They click "Done — move to next stage" manually after sending all channels.

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    console.error('Send email error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
