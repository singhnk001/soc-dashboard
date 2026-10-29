import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ status: 'success' });
  // Invalidate HttpOnly cookie on server
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
