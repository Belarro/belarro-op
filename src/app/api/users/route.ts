import { NextRequest, NextResponse } from 'next/server';
import * as bcrypt from 'bcrypt';
import { fetchFromSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/session';

/**
 * User management (admin role only — middleware lets any session through to
 * /api/*, so the admin check is enforced here explicitly).
 *
 * GET    /api/users            -> list users (no hashes)
 * POST   /api/users            -> { email, password, name?, role } create
 * PUT    /api/users            -> { id, role?, name?, password? } update
 * DELETE /api/users            -> { id } soft delete
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
    const users = await fetchFromSupabase(
      '/admin_users?deleted_at=is.null&select=id,email,name,role,last_login_at,created_at&order=created_at.asc'
    );
    return NextResponse.json({ success: true, data: users || [] });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const { email, password, name, role } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'email and password are required' }, { status: 400 });
    }
    if (role && !['admin', 'field', 'farm'].includes(role)) {
      return NextResponse.json({ success: false, error: 'Invalid role' }, { status: 400 });
    }

    const existing = await fetchFromSupabase(`/admin_users?email=eq.${encodeURIComponent(email)}&select=id,deleted_at`);
    if (existing && existing.length > 0 && !existing[0].deleted_at) {
      return NextResponse.json({ success: false, error: 'A user with this email already exists' }, { status: 409 });
    }

    const password_hash = await bcrypt.hash(password, 10);

    if (existing && existing.length > 0) {
      // Reactivate a soft-deleted user
      const updated = await fetchFromSupabase(`/admin_users?id=eq.${existing[0].id}`, {
        method: 'PATCH',
        body: JSON.stringify({ password_hash, name: name || null, role: role || 'field', deleted_at: null }),
      });
      return NextResponse.json({ success: true, data: updated ? { id: updated[0]?.id, email } : { email } });
    }

    const created = await fetchFromSupabase('/admin_users', {
      method: 'POST',
      body: JSON.stringify({ email, password_hash, name: name || null, role: role || 'field' }),
    });
    return NextResponse.json({ success: true, data: created ? { id: created[0]?.id, email } : { email } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const { id, role, name, password } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    if (role && !['admin', 'field', 'farm'].includes(role)) {
      return NextResponse.json({ success: false, error: 'Invalid role' }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (role !== undefined) patch.role = role;
    if (name !== undefined) patch.name = name;
    if (password) patch.password_hash = await bcrypt.hash(password, 10);
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 });
    }

    await fetchFromSupabase(`/admin_users?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });

    // Guard: never delete the last remaining admin.
    const admins = await fetchFromSupabase('/admin_users?deleted_at=is.null&role=eq.admin&select=id');
    if (admins && admins.length === 1 && String(admins[0].id) === String(id)) {
      return NextResponse.json({ success: false, error: 'Cannot delete the last admin' }, { status: 400 });
    }

    await fetchFromSupabase(`/admin_users?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
