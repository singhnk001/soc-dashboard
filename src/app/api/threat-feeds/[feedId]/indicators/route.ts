import { NextResponse } from 'next/server';
import { getDemoIndicatorsForFeed, shouldProxy } from '@/lib/demo-data';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ feedId: string }> }
) {
  const { feedId } = await params;
  if (!shouldProxy()) {
    return NextResponse.json({ data: getDemoIndicatorsForFeed(feedId) });
  }
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  try {
    const res = await fetch(`${apiUrl}/api/threat-feeds/${feedId}/indicators`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch {}
  return NextResponse.json({ data: getDemoIndicatorsForFeed(feedId) });
}

export async function DELETE() {
  return NextResponse.json({ status: 'success' });
}
