import { NextResponse } from 'next/server';
import { DEMO_PLAYBOOKS } from '@/lib/demo-data';

export async function GET() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8002';
  try {
    const res = await fetch(`${apiUrl}/api/playbooks`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch {
    // Fallback
  }
  return NextResponse.json(DEMO_PLAYBOOKS);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return NextResponse.json({ id: `pb-${Date.now()}`, status: 'created' });
  } catch {
    return NextResponse.json({ id: 'pb-demo', status: 'created' });
  }
}
