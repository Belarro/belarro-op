import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const procedures = await fetchFromSupabase(
      `/belarro_v4_growth_procedure?select=crop_id,light_enabled,light_days,blackout_enabled,blackout_days,humidity_dome_enabled,humidity_dome_days,stack_enabled,stack_days&limit=100`
    );

    return NextResponse.json({
      success: true,
      count: procedures.length,
      data: procedures,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
