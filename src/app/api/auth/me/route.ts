import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken } from '@/lib/auth-token';

export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get('soc_session')?.value;
  const verification = await verifySessionToken(sessionCookie);

  if (!verification.valid || !verification.payload) {
    const response = NextResponse.json(
      { authenticated: false, detail: verification.error || 'Unauthenticated' },
      { status: 401 }
    );
    // Securely wipe invalid/tampered cookie
    response.cookies.set({
      name: 'soc_session',
      value: '',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    return response;
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: verification.payload.sub,
      username: verification.payload.username,
      role: verification.payload.role,
      real_name: verification.payload.real_name,
    },
  });
}
