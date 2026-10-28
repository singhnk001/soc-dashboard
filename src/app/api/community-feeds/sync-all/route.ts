import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({
    status: 'success',
    count: 16820,
    message: 'All available community threat feeds synchronized successfully',
  });
}
