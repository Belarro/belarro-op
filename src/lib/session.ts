// Stateless HMAC-signed session tokens using Web Crypto API (Edge-compatible).
// Token format: exp.email.hmacSig (base64url encoded)

const encoder = new TextEncoder();

async function getSecretKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set');

  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function bufferToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64urlToBuffer(str: string): ArrayBuffer {
  const padded = str.padEnd(str.length + (4 - (str.length % 4)) % 4, '=');
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export interface SessionPayload {
  email: string;
  exp: number;
  role?: 'admin' | 'farm' | 'field';
}

// Token format: base64url(JSON payload) + '.' + base64url(HMAC signature).
// Payload is JSON-encoded so emails with dots can't break parsing.
export async function signSession(payload: SessionPayload): Promise<string> {
  const key = await getSecretKey();
  const exp = payload.exp || Math.floor(Date.now() / 1000) + 86400 * 7;
  const body = bufferToBase64url(
    encoder.encode(JSON.stringify({ email: payload.email, exp, role: payload.role })).buffer as ArrayBuffer
  );

  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return `${body}.${bufferToBase64url(sig)}`;
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const key = await getSecretKey();
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [body, sig] = parts;

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64urlToBuffer(sig),
      encoder.encode(body)
    );

    if (!isValid) return null;

    const decoded = JSON.parse(
      new TextDecoder().decode(base64urlToBuffer(body))
    ) as SessionPayload;

    if (!decoded.email || !decoded.exp) return null;
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;

    return decoded;
  } catch (err) {
    return null;
  }
}

export function getSessionCookie(token: string): string {
  return `belarro_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${86400 * 7}`;
}
