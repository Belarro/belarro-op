'use server';

import { NextRequest, NextResponse } from 'next/server';
import * as bcrypt from 'bcrypt';
import { fetchFromSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/session';

/**
 * Admin-only endpoints for managing join requests
 *
 * GET    /api/auth/join-requests           -> list pending join requests
 * POST   /api/auth/join-requests           -> { id, action: 'approve'|'reject' } approve/reject request
 */

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get('belarro_session')?.value;
  const session = token ? await verifySession(token) : null;
  if (!session || (session.role && session.role !== 'admin')) {
    return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const requests = await fetchFromSupabase(
      `/user_join_requests?status=eq.pending&select=id,email,name,requested_at&order=requested_at.desc`
    );
    return NextResponse.json({ success: true, data: requests || [] });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const { id, action } = await request.json();

    if (!id || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'id and action (approve|reject) are required' },
        { status: 400 }
      );
    }

    // Get the request
    const requests = await fetchFromSupabase(
      `/user_join_requests?id=eq.${encodeURIComponent(id)}&select=id,email,name,status`
    );

    if (!Array.isArray(requests) || requests.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Request not found' },
        { status: 404 }
      );
    }

    const joinRequest = requests[0];

    if (joinRequest.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: 'Request already processed' },
        { status: 400 }
      );
    }

    if (action === 'reject') {
      await fetchFromSupabase(`/user_join_requests?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'rejected', reviewed_at: new Date().toISOString() }),
      });
      return NextResponse.json({ success: true, message: 'Request rejected' });
    }

    // Approve: create user with a default password (user must change on first login)
    const tempPassword = Math.random().toString(36).slice(-12); // Temporary password
    const password_hash = await bcrypt.hash(tempPassword, 10);

    const existing = await fetchFromSupabase(
      `/admin_users?select=id,deleted_at`
    );

    if (Array.isArray(existing) && existing.length > 0) {
      const userExists = existing.find(u => u.email?.toLowerCase?.() === joinRequest.email.toLowerCase());
      if (userExists) {
        if (!userExists.deleted_at) {
          return NextResponse.json(
            { success: false, error: 'User already exists' },
            { status: 409 }
          );
        }
        // Reactivate soft-deleted user
        await fetchFromSupabase(`/admin_users?id=eq.${userExists.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            password_hash,
            name: joinRequest.name || null,
            role: 'field',
            deleted_at: null,
          }),
        });
      }
    } else {
      // Create new user
      await fetchFromSupabase('/admin_users', {
        method: 'POST',
        body: JSON.stringify({
          email: joinRequest.email,
          password_hash,
          name: joinRequest.name || null,
          role: 'field',
        }),
      });
    }

    // Mark request as approved
    await fetchFromSupabase(`/user_join_requests?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
      }),
    });

    return NextResponse.json({
      success: true,
      message: 'User approved and created',
      data: {
        email: joinRequest.email,
        tempPassword, // Return so admin can send it to user
      },
    });
  } catch (error) {
    console.error('Join request approval error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
