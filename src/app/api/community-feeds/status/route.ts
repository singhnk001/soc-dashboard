import { NextResponse } from 'next/server';
import { shouldProxy } from '@/lib/demo-data';

const STATUS_DATA = {
  status: 'success',
  data: {
    threatfox: {
      last_updated: new Date(Date.now() - 3600 * 1000 * 3).toISOString(),
      indicator_count: 2450,
      status: 'Active',
      imported: false,
    },
    urlhaus: {
      last_updated: new Date(Date.now() - 3600 * 1000).toISOString(),
      indicator_count: 3120,
      status: 'Active',
      imported: false,
    },
    'cisa-kev': {
      last_updated: new Date(Date.now() - 86400 * 1000).toISOString(),
      indicator_count: 1120,
      status: 'Active',
      imported: false,
    },
    cisa: {
      last_updated: new Date(Date.now() - 86400 * 1000).toISOString(),
      indicator_count: 1120,
      status: 'Active',
      imported: false,
    },
    abuseipdb: {
      last_updated: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
      indicator_count: 4890,
      status: 'Active',
      imported: false,
      key_configured: true,
    },
    alienvault: {
      last_updated: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
      indicator_count: 5240,
      status: 'Active',
      imported: true,
    },
  },
};

export async function GET() {
  if (!shouldProxy()) {
    return NextResponse.json(STATUS_DATA);
  }
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  try {
    const res = await fetch(`${apiUrl}/api/community-feeds/status`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch {}
  return NextResponse.json(STATUS_DATA);
}
