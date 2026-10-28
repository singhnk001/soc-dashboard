import { NextResponse } from 'next/server';
import { DEMO_THREAT_FEEDS } from '@/lib/demo-data';

export async function GET() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8002';
  try {
    const res = await fetch(`${apiUrl}/api/threat-feeds`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch {
    // Fallback
  }
  return NextResponse.json({ data: DEMO_THREAT_FEEDS });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return NextResponse.json({ status: 'created', id: `feed-${Date.now()}` });
  } catch {
    return NextResponse.json({ status: 'created', id: 'feed-demo' });
  }
}
