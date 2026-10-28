import { NextResponse } from 'next/server';
import { generateAlerts } from '@/lib/mock-data';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8002';

  try {
    const res = await fetch(`${apiUrl}/api/alerts?${searchParams.toString()}`, {
      signal: AbortSignal.timeout(2500),
      cache: 'no-store',
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch {
    // Fallback
  }
  const alerts = generateAlerts(limit);
  return NextResponse.json({ data: alerts, total: alerts.length });
}
