import { NextResponse } from 'next/server';
import { generateDashboardStats } from '@/lib/mock-data';

export async function GET() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8002';
  try {
    const res = await fetch(`${apiUrl}/api/stats`, {
      signal: AbortSignal.timeout(2500),
      cache: 'no-store',
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch {
    // Fallback to rich telemetry mock data on standalone Vercel deployment
  }
  return NextResponse.json(generateDashboardStats());
}
