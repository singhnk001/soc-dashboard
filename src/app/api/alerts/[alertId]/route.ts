import { NextResponse } from 'next/server';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ alertId: string }> }
) {
  const { alertId } = await params;
  const body = await request.json();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8002';

  try {
    const res = await fetch(`${apiUrl}/api/alerts/${alertId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    } else {
      const errText = await res.text();
      return NextResponse.json(
        { detail: errText || `Failed to update alert (HTTP ${res.status})` },
        { status: res.status }
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      { detail: err.message || 'FastAPI backend connection error' },
      { status: 502 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ alertId: string }> }
) {
  const { alertId } = await params;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8002';

  try {
    const res = await fetch(`${apiUrl}/api/alerts/${alertId}`, {
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch {}

  return NextResponse.json({ id: alertId, status: 'unknown' });
}
