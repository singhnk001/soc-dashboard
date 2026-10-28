import { NextResponse } from 'next/server';
import { DEMO_THREAT_FEEDS } from '@/lib/demo-data';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ feedId: string }> }
) {
  const { feedId } = await params;
  const feed = DEMO_THREAT_FEEDS.find(f => f.id === feedId) || {
    id: feedId,
    name: 'Threat Intel Feed',
    status: 'Active',
    indicator_count: 5240,
    url: 'https://otx.alienvault.com',
    type: 'API',
    category: 'Multi-Source IOCs',
  };
  return NextResponse.json({ data: feed });
}

export async function PUT() {
  return NextResponse.json({ status: 'updated' });
}

export async function DELETE() {
  return NextResponse.json({ status: 'deleted' });
}
