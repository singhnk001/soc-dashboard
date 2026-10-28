import { NextResponse } from 'next/server';
import { DEMO_API_SOURCES, shouldProxy } from '@/lib/demo-data';

export async function GET() {
  if (!shouldProxy()) {
    return NextResponse.json(DEMO_API_SOURCES);
  }
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  try {
    const res = await fetch(`${apiUrl}/api/api-sources`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch {}
  return NextResponse.json(DEMO_API_SOURCES);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return NextResponse.json({ status: 'created', id: `api-${Date.now()}` });
  } catch {
    return NextResponse.json({ status: 'created', id: 'api-demo' });
  }
}
