import { NextResponse } from 'next/server';
import { DEMO_SETTINGS } from '@/lib/demo-data';

export async function GET() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8002';
  try {
    const res = await fetch(`${apiUrl}/api/settings`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch {
    // Fallback
  }
  return NextResponse.json({ status: 'success', data: DEMO_SETTINGS });
}

export async function POST() {
  return NextResponse.json({ status: 'success' });
}
