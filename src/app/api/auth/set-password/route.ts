'use server';

import { NextRequest, NextResponse } from 'next/server';
import * as bcrypt from 'bcrypt';
import { fetchFromSupabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { token, email, password } = await request.json();

    if (!token || !email || !password) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Get the join request
    const requests = await fetchFromSupabase(
      `/user_join_requests?select=id,email,name,status,approval_token,approved_until`
    );

    if (!Array.isArray(requests) || requests.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid token or request not found' },
        { status: 404 }
      );
    }

    const joinRequest = requests.find(
      r => r.approval_token === token && r.email.toLowerCase() === email.toLowerCase()
    );

    if (!joinRequest) {
      return NextResponse.json(
        { success: false, error: 'Invalid token or request expired' },
        { status: 401 }
      );
    }

    if (joinRequest.status !== 'approved') {
      return NextResponse.json(
        { success: false, error: 'Request has not been approved' },
        { status: 400 }
      );
    }

    // Check if token is still valid (within 24 hours)
    if (joinRequest.approved_until && new Date(joinRequest.approved_until) < new Date()) {
      return NextResponse.json(
        { success: false, error: 'Approval link has expired' },
        { status: 401 }
      );
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Check if user exists (from any previous request)
    const existing = await fetchFromSupabase(
      `/admin_users?select=id,deleted_at`
    );

    if (Array.isArray(existing) && existing.length > 0) {
      const userExists = existing.find(u => u.email?.toLowerCase?.() === email.toLowerCase());
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
    } else {
      // Create new user (first user)
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

    // Clear the approval token (password set)
    await fetchFromSupabase(`/user_join_requests?id=eq.${encodeURIComponent(joinRequest.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        approval_token: null,
      }),
    });

    return NextResponse.json({
      success: true,
      message: 'Account created successfully. You can now log in.',
    });
  } catch (error) {
    console.error('Set password error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to set password' },
      { status: 500 }
    );
  }
}
