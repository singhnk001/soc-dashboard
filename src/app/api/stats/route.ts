import { NextResponse } from 'next/server';
import { generateDashboardStats } from '@/lib/mock-data';
import { shouldProxy } from '@/lib/demo-data';

export async function GET() {
  if (!shouldProxy()) {
    return NextResponse.json(generateDashboardStats());
  }
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  try {
    const res = await fetch(`${apiUrl}/api/stats`, {
      signal: AbortSignal.timeout(2500),
      cache: 'no-store',
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch {}
  return NextResponse.json(generateDashboardStats());
}
