import { NextResponse } from 'next/server';
import { DEMO_SOURCES } from '@/lib/demo-data';

export async function GET() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8002';
  try {
    const res = await fetch(`${apiUrl}/api/sources`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch {
    // Fallback to demo data
  }
  return NextResponse.json(DEMO_SOURCES);
}

export async function DELETE() {
  return NextResponse.json({ status: 'deleted' });
}
