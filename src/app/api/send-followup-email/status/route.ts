import { NextResponse } from 'next/server';

export async function GET() {
  const configured = !!(process.env.GMAIL_SMTP_USER && process.env.GMAIL_SMTP_APP_PASSWORD);
  return NextResponse.json({ configured });
}
