import { NextResponse } from 'next/server';
import { DEMO_SETTINGS, shouldProxy } from '@/lib/demo-data';

export async function GET() {
  if (!shouldProxy()) {
    return NextResponse.json({ status: 'success', data: DEMO_SETTINGS });
  }
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  try {
    const res = await fetch(`${apiUrl}/api/settings`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch {}
  return NextResponse.json({ status: 'success', data: DEMO_SETTINGS });
}

export async function POST() {
  return NextResponse.json({ status: 'success' });
}
