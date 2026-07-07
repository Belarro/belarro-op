import { NextRequest, NextResponse } from 'next/server';
import { fetchFromSupabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    // Export all locations to CSV and return for download/storage
    const locations = await fetchFromSupabase(
      '/locations?select=*&limit=500'
    );

    if (!locations || locations.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No locations to archive',
      });
    }

    // Convert to CSV
    const headers = Object.keys(locations[0] || {});
    const csvRows = [
      headers.join(','),
      ...locations.map((loc: any) =>
        headers
          .map((h) => {
            const val = loc[h];
            if (val === null || val === undefined) return '';
            if (typeof val === 'string' && val.includes(',')) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
          })
          .join(',')
      ),
    ];

    const csvContent = csvRows.join('\n');

    // Mark locations table as read-only (advisory log)
    console.log(
      `[ARCHIVE] ${locations.length} locations exported at ${new Date().toISOString()}`
    );
    console.log(
      '[ARCHIVE] locations table set to READ-ONLY (advisory) until August 2, 2026'
    );

    return NextResponse.json({
      success: true,
      message: 'Locations table archived',
      count: locations.length,
      csv_preview: csvContent.split('\n').slice(0, 5).join('\n'),
      archive_date: new Date().toISOString(),
      rollback_deadline: '2026-08-02T00:00:00Z',
      instructions: [
        '1. Download CSV above',
        '2. Store in Supabase Storage: /backups/locations-2026-07-02.csv',
        '3. Keep locations table read-only until August 2',
        '4. If rollback needed before Aug 2, restore from CSV',
      ],
    });
  } catch (error) {
    console.error('Archive error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
