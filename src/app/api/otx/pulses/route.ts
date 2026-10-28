import { NextResponse } from 'next/server';
import { DEMO_OTX_PULSES, shouldProxy } from '@/lib/demo-data';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '20', 10);

  if (!shouldProxy()) {
    let filtered = DEMO_OTX_PULSES;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = DEMO_OTX_PULSES.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return NextResponse.json({
      data: filtered,
      count: filtered.length,
      page,
      limit,
    });
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  try {
    const res = await fetch(`${apiUrl}/api/otx/pulses?${searchParams.toString()}`, {
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch {}

  return NextResponse.json({
    data: DEMO_OTX_PULSES,
    count: DEMO_OTX_PULSES.length,
    page: 1,
    limit: 20,
  });
}
