import { NextResponse } from 'next/server';
import { DEMO_REFERENCE_SETS, shouldProxy } from '@/lib/demo-data';

export async function GET() {
  if (!shouldProxy()) {
    return NextResponse.json({ data: DEMO_REFERENCE_SETS });
  }
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  try {
    const res = await fetch(`${apiUrl}/api/reference-sets`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch {}
  return NextResponse.json({ data: DEMO_REFERENCE_SETS });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return NextResponse.json({ status: 'success', id: `rs-${Date.now()}` });
  } catch {
    return NextResponse.json({ status: 'success', id: 'rs-demo' });
  }
}
