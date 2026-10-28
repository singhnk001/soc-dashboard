import { NextResponse } from 'next/server';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ hostname: string }> }
) {
  const { hostname } = await params;
  return NextResponse.json({
    status: 'updated',
    hostname: decodeURIComponent(hostname),
  });
}
