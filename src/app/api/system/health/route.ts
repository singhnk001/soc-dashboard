import { NextResponse } from 'next/server';
import { DEMO_SYSTEM_HEALTH } from '@/lib/demo-data';

export async function GET() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8002';
  try {
    const res = await fetch(`${apiUrl}/api/system/health`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch {
    // Fallback
  }
  return NextResponse.json(DEMO_SYSTEM_HEALTH);
}
