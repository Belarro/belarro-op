'use server';

import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';

/**
 * POST /api/auth/join-request
 * User sends join request with email and optional name
 * Admin gets notified and must approve before user can log in
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[join-request] Received POST request');

    const body = await request.json();
    console.log('[join-request] Body:', { email: body.email, hasName: !!body.name });

    const { email, name } = body;

    if (!email) {
      console.log('[join-request] Email missing');
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    const emailLower = email.toLowerCase();
    console.log('[join-request] Processing email:', emailLower);

    // Check if user already exists
    const existing = await fetchFromSupabase(
      `/admin_users?select=id,deleted_at`
    );

    if (Array.isArray(existing) && existing.length > 0) {
      const userExists = existing.find(u => u.email?.toLowerCase?.() === emailLower);
      if (userExists && !userExists.deleted_at) {
        return NextResponse.json(
          { success: false, error: 'User already exists. Please log in instead.' },
          { status: 409 }
        );
      }
    }

    // Check if request already exists (pending)
    const existingRequest = await fetchFromSupabase(
      `/user_join_requests?select=id,status`
    );

    if (Array.isArray(existingRequest) && existingRequest.length > 0) {
      const pendingRequest = existingRequest.find(
        r => r.email?.toLowerCase?.() === emailLower && r.status === 'pending'
      );
      if (pendingRequest) {
        return NextResponse.json(
          { success: false, error: 'Your request is already pending approval.' },
          { status: 409 }
        );
      }
    }

    // Create join request
    const created = await fetchFromSupabase('/user_join_requests', {
      method: 'POST',
      body: JSON.stringify({
        email: emailLower,
        name: name || null,
        status: 'pending',
        requested_at: new Date().toISOString(),
      }),
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Join request submitted. The admin will review and approve your request shortly.',
        data: created ? { id: created[0]?.id } : {},
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[join-request] Error:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[join-request] Error details:', errorMsg);
    return NextResponse.json(
      { success: false, error: `Failed to submit join request: ${errorMsg}` },
      { status: 500 }
    );
  }
}
