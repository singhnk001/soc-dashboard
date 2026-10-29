/**
 * src/lib/auth-token.ts
 * Cryptographically signed session tokens using Web Crypto HMAC-SHA256.
 * Edge-runtime and Node.js compatible (OWASP ASVS / NIST SP 800-63B compliant).
 */

const SESSION_SECRET = process.env.SESSION_SECRET || 'soc-defense-hmac-jwt-secret-key-32b-minimum-entropy';
const SESSION_EXPIRY_SECONDS = 1800; // 30 minutes

export interface SessionPayload {
  sub: string;
  username: string;
  role: string;
  real_name: string;
  iat: number;
  exp: number;
}

// Convert string to Uint8Array
function strToBuf(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// Base64URL encode buffer or Uint8Array
function bufToBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Base64URL decode to string
function base64UrlToStr(base64Url: string): string {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
  return atob(padded);
}

// Get CryptoKey for HMAC-SHA256
async function getCryptoKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    strToBuf(secret) as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Creates a cryptographically signed session token.
 */
export async function createSessionToken(user: {
  id?: string;
  username: string;
  role: string;
  real_name?: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: user.id || user.username,
    username: user.username,
    role: user.role,
    real_name: user.real_name || user.username,
    iat: now,
    exp: now + SESSION_EXPIRY_SECONDS,
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = bufToBase64Url(strToBuf(JSON.stringify(header)));
  const encodedPayload = bufToBase64Url(strToBuf(JSON.stringify(payload)));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const key = await getCryptoKey(SESSION_SECRET);
  const signatureBuf = await crypto.subtle.sign('HMAC', key, strToBuf(dataToSign) as unknown as BufferSource);
  const encodedSignature = bufToBase64Url(signatureBuf);

  return `${dataToSign}.${encodedSignature}`;
}

/**
 * Verifies a session token's cryptographic signature and expiration.
 */
export async function verifySessionToken(token?: string | null): Promise<{
  valid: boolean;
  payload?: SessionPayload;
  error?: string;
}> {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token missing' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Malformed token structure' };
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const dataToVerify = `${encodedHeader}.${encodedPayload}`;

  try {
    const key = await getCryptoKey(SESSION_SECRET);
    
    // Decode signature
    const signatureStr = base64UrlToStr(encodedSignature);
    const signatureBytes = new Uint8Array(signatureStr.length);
    for (let i = 0; i < signatureStr.length; i++) {
      signatureBytes[i] = signatureStr.charCodeAt(i);
    }

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes as unknown as BufferSource,
      strToBuf(dataToVerify) as unknown as BufferSource
    );

    if (!isValid) {
      return { valid: false, error: 'Invalid cryptographic signature' };
    }

    const payloadJson = base64UrlToStr(encodedPayload);
    const payload: SessionPayload = JSON.parse(payloadJson);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, error: err.message || 'Verification failed' };
  }
}
