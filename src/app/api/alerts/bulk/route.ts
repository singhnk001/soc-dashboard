import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8002';

  try {
    const res = await fetch(`${apiUrl}/api/alerts/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    } else {
      const errText = await res.text();
      return NextResponse.json(
        { detail: errText || `Failed to bulk update alerts (HTTP ${res.status})` },
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
