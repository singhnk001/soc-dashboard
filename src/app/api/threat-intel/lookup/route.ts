import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ioc = searchParams.get('ioc') || '194.26.29.112';
  const iocType = searchParams.get('ioc_type') || 'IP';
  const provider = searchParams.get('provider') || 'VirusTotal';

  return NextResponse.json({
    status: 'success',
    provider,
    data: {
      ioc,
      type: iocType,
      reputation: -78,
      malicious_votes: 42,
      harmless_votes: 3,
      tags: ['c2', 'cobalt-strike', 'fin7'],
      country: 'NL',
      as_owner: 'Hostkey B.V.',
      last_analysis_date: new Date().toISOString(),
    },
  });
}
