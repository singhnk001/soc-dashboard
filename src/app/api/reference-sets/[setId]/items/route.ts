import { NextResponse } from 'next/server';
import { DEMO_REFERENCE_ITEMS, shouldProxy } from '@/lib/demo-data';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ setId: string }> }
) {
  if (!shouldProxy()) {
    return NextResponse.json({ data: DEMO_REFERENCE_ITEMS });
  }
  const { setId } = await params;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  try {
    const res = await fetch(`${apiUrl}/api/reference-sets/${setId}/items`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch {}
  return NextResponse.json({ data: DEMO_REFERENCE_ITEMS });
}

export async function POST() {
  return NextResponse.json({ status: 'success', id: `item-${Date.now()}` });
}
