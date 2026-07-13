'use server';

import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('belarro_session')?.value;
    const session = token ? await verifySession(token) : null;

    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { email, setPasswordLink } = await request.json();

    if (!email || !setPasswordLink) {
      return NextResponse.json(
        { error: 'Email and setup link required' },
        { status: 400 }
      );
    }

    // Send email via Gmail API (if configured)
    // For now, just return the link so admin can copy it
    // In production, you'd use: nodemailer, SendGrid, AWS SES, etc.

    const emailBody = `
Hello,

Your request to join Belarro has been approved!

Click the link below to set up your password and complete your account:

${setPasswordLink}

This link expires in 24 hours.

If you didn't request access, please ignore this email.

Best regards,
Belarro Team
    `.trim();

    // TODO: Send email via your email service
    // For now, return success - admin can copy and send manually

    return NextResponse.json({
      success: true,
      message: 'Email ready to send (copy the link above)',
      emailBody,
      emailTo: email,
    });
  } catch (error) {
    console.error('Send approval email error:', error);
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    );
  }
}
