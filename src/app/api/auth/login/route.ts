import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body;

    // Check built-in demo account credentials (read-only access)
    if (
      username?.toLowerCase() === 'demo' &&
      (password === 'demo123' || password === 'demo')
    ) {
      return NextResponse.json({
        status: 'success',
        user: {
          id: 'demo-readonly-account',
          username: 'demo',
          role: 'readonly',
          status: 'Active',
          real_name: 'Demo Analyst (Read-Only)',
          mfa_enabled: false,
        },
      });
    }

    // Readonly account fallback
    if (
      username?.toLowerCase() === 'readonly' &&
      (password === 'readonly@123' || password === 'readonly')
    ) {
      return NextResponse.json({
        status: 'success',
        user: {
          id: 'readonly-002',
          username: 'readonly',
          role: 'readonly',
          status: 'Active',
          real_name: 'Read Only User',
          mfa_enabled: false,
        },
      });
    }

    // Try forwarding to external or local FastAPI backend if reachable
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
        return NextResponse.json(data);
      }
    } catch {
      // Backend not running (e.g. standalone Vercel preview)
    }

    return NextResponse.json(
      { detail: 'Invalid credentials. Use demo / demo123 for read-only access.' },
      { status: 401 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { detail: err.message || 'Authentication error' },
      { status: 500 }
    );
  }
}
