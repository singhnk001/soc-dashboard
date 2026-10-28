import { NextResponse } from 'next/server';
import { DEMO_REFERENCE_ITEMS } from '@/lib/demo-data';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ setId: string }> }
) {
  const { setId } = await params;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8002';
  try {
    const res = await fetch(`${apiUrl}/api/reference-sets/${setId}/items`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch {
    // Fallback
  }
  return NextResponse.json({ data: DEMO_REFERENCE_ITEMS });
}

export async function POST() {
  return NextResponse.json({ status: 'success', id: `item-${Date.now()}` });
}
