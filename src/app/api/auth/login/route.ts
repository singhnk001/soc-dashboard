import { NextResponse } from 'next/server';
import { createSessionToken } from '@/lib/auth-token';

async function createAuthSuccessResponse(user: {
  id: string;
  username: string;
  role: string;
  status: string;
  real_name: string;
  mfa_enabled?: boolean;
}) {
  const token = await createSessionToken(user);
  const response = NextResponse.json({
    status: 'success',
    user,
  });

  // Set enterprise HttpOnly, SameSite=Lax, Secure session cookie (OWASP ASVS compliant)
  response.cookies.set({
    name: 'soc_session',
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 1800, // 30 minutes
  });

  return response;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body;

    // Check built-in demo account credentials (read-only access)
    if (
      username?.toLowerCase() === 'demo' &&
      (password === 'demo123' || password === 'demo')
    ) {
      return await createAuthSuccessResponse({
        id: 'demo-readonly-account',
        username: 'demo',
        role: 'readonly',
        status: 'Active',
        real_name: 'Demo Analyst (Read-Only)',
        mfa_enabled: false,
      });
    }

    // Built-in Administrator fallback
    if (
      username?.toLowerCase() === 'admin' &&
      (password === 'admin123' || password === 'admin' || password === 'password')
    ) {
      return await createAuthSuccessResponse({
        id: 'admin-builtin',
        username: 'admin',
        role: 'admin',
        status: 'Active',
        real_name: 'Administrator',
        mfa_enabled: false,
      });
    }

    // Readonly account fallback
    if (
      username?.toLowerCase() === 'readonly' &&
      (password === 'readonly@123' || password === 'readonly')
    ) {
      return await createAuthSuccessResponse({
        id: 'readonly-002',
        username: 'readonly',
        role: 'readonly',
        status: 'Active',
        real_name: 'Read Only User',
        mfa_enabled: false,
      });
    }

    // Forward to FastAPI backend on port 8002
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8002';
    try {
      const backendRes = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(3000),
      });

      if (backendRes.ok) {
        const data = await backendRes.json();
        if (data.status === 'success' && data.user) {
          return await createAuthSuccessResponse(data.user);
        }
        return NextResponse.json(data);
      }
    } catch {
      // Backend unreachable (e.g. standalone preview)
    }

    return NextResponse.json(
      { detail: 'Invalid credentials. Use demo / demo123 or admin / admin123' },
      { status: 401 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { detail: err.message || 'Authentication error' },
      { status: 500 }
    );
  }
}
