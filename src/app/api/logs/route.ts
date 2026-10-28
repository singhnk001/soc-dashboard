import { NextResponse } from 'next/server';
import { generateLogs } from '@/lib/mock-data';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8002';

  try {
    const res = await fetch(`${apiUrl}/api/logs?${searchParams.toString()}`, {
      signal: AbortSignal.timeout(2500),
      cache: 'no-store',
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch {
    // Fallback
  }
  const logs = generateLogs(limit);
  return NextResponse.json({
    data: logs,
    total: 1000,
    page,
    limit,
    pages: Math.ceil(1000 / limit),
    histogram: [],
  });
}
