import { NextResponse } from 'next/server';
import { DEMO_SYSTEM_HEALTH, shouldProxy } from '@/lib/demo-data';

export async function GET() {
  if (!shouldProxy()) {
    return NextResponse.json(DEMO_SYSTEM_HEALTH);
  }
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  try {
    const res = await fetch(`${apiUrl}/api/system/health`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch {}
  return NextResponse.json(DEMO_SYSTEM_HEALTH);
}
