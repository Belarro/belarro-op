import { NextRequest, NextResponse } from 'next/server';
// import removed

function getSupabaseConfig() {
  const config.SUPABASE_URL = process.env.NEXT_PUBLIC_config.SUPABASE_URL;
  const config.SUPABASE_SERVICE_ROLE_KEY = process.env.config.SUPABASE_SERVICE_ROLE_KEY;
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing required environment variables');
  }
  return { config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY };
}

async function ensureBucketExists() {
  const { config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
  const url = `${config.SUPABASE_URL}/storage/v1/bucket`;
  try {
    const headers: Record<string, string> = {
      'apikey': config.SUPABASE_SERVICE_ROLE_KEY!,
      'Authorization': `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY!}`,
      'Content-Type': 'application/json',
    };
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: 'crop-photos',
        name: 'crop-photos',
        public: true,
      }),
    });
    
    if (res.ok) {
      console.log('Successfully created crop-photos bucket');
      return true;
    } else {
      const errText = await res.text();
      console.warn('Bucket creation status:', res.status, errText);
    }
  } catch (err) {
    console.error('Failed to create bucket:', err);
  }
  return false;
}

export async function POST(request: NextRequest) {
  try {
    // auth handled by middleware
    // if (!auth.ok) return auth.response;
    const config = getSupabaseConfig();
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Sanitize filename and make unique
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${timestamp}_${sanitizedName}`;

    // Upload to Supabase Storage via REST API
    const uploadUrl = `${config.SUPABASE_URL}/storage/v1/object/crop-photos/${filename}`;
    const headers: Record<string, string> = {
      'apikey': config.SUPABASE_SERVICE_ROLE_KEY!,
      'Authorization': `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY!}`,
      'Content-Type': file.type || 'image/jpeg',
    };
    let uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers,
      body: buffer,
    });

    // If upload fails, check if it's due to missing bucket and self-heal
    if (!uploadRes.ok) {
      const errText = await uploadRes.clone().text();
      let isBucketNotFound = false;
      try {
        const errJson = JSON.parse(errText);
        if (errJson.error === 'Bucket not found' || errJson.message === 'Bucket not found' || errJson.statusCode === '404') {
          isBucketNotFound = true;
        }
      } catch (_) {
        if (errText.includes('Bucket not found')) {
          isBucketNotFound = true;
        }
      }

      if (isBucketNotFound || uploadRes.status === 404) {
        console.log('Bucket "crop-photos" not found. Attempting auto-creation...');
        await ensureBucketExists();

        // Retry the upload after creating the bucket
        const retryHeaders: Record<string, string> = {
          'apikey': config.SUPABASE_SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY!}`,
          'Content-Type': file.type || 'image/jpeg',
        };
        uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: retryHeaders,
          body: buffer,
        });
      }
    }

    // Check if the final/retry response is successful
    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('Supabase storage upload failed:', errText);
      return NextResponse.json({ 
        success: false, 
        error: `Upload failed: ${uploadRes.status} - ${errText}` 
      }, { status: 500 });
    }

    // Get public URL
    const publicUrl = `${config.SUPABASE_URL}/storage/v1/object/public/crop-photos/${filename}`;

    return NextResponse.json({
      success: true,
      data: {
        url: publicUrl,
        filename: filename
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
