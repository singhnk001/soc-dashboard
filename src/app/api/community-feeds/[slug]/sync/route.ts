import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  return NextResponse.json({
    status: 'success',
    count: 3120,
    feed_id: `tf-${slug}`,
    message: `Community feed ${slug} synchronized successfully`,
  });
}
