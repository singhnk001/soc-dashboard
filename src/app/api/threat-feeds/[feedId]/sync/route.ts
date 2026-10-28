import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ feedId: string }> }
) {
  const { feedId } = await params;
  return NextResponse.json({
    status: 'success',
    count: 5240,
    last_updated: new Date().toISOString(),
    message: `Feed ${feedId} synchronized successfully`,
  });
}
