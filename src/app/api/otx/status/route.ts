import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    configured: true,
    username: 'Demo_SOC_Analyst',
    message: 'AlienVault OTX Synchronized',
  });
}
