import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ pulseId: string }> }
) {
  const { pulseId } = await params;
  return NextResponse.json({
    status: 'success',
    message: `Pulse ${pulseId} imported successfully`,
    feed_id: `tf-otx-${pulseId}`,
  });
}
