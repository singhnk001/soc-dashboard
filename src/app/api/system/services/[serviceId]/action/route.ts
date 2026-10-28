import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  const { serviceId } = await params;
  return NextResponse.json({
    status: 'ok',
    message: `Service ${serviceId} action completed successfully (demo mode)`,
  });
}
