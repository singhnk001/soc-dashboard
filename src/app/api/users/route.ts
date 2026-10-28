import { NextResponse } from 'next/server';
import { DEMO_USERS, shouldProxy } from '@/lib/demo-data';

export async function GET() {
  if (!shouldProxy()) {
    return NextResponse.json(DEMO_USERS);
  }
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  try {
    const res = await fetch(`${apiUrl}/api/users`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch {}
  return NextResponse.json(DEMO_USERS);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return NextResponse.json({ status: 'created', id: `usr-${Date.now()}` });
  } catch {
    return NextResponse.json({ status: 'created', id: 'usr-demo' });
  }
}
