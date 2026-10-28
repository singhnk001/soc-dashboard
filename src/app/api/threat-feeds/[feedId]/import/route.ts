import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ feedId: string }> }
) {
  const { feedId } = await params;
  return NextResponse.json({
    status: 'success',
    imported: 250,
    message: `Indicators successfully imported into feed ${feedId}`,
  });
}
