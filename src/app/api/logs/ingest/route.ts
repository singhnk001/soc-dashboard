import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8002';
    
    try {
      const res = await fetch(`${apiUrl}/api/logs/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch {
      // Backend not running (e.g. standalone preview)
    }

    return NextResponse.json({ status: 'ok', ingested: 1, mode: 'preview_mock' });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Ingestion proxy error' },
      { status: 500 }
    );
  }
}
