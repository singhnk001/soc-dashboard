import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ alertId: string }> }
) {
  const { alertId } = await params;
  return NextResponse.json({
    data: [
      {
        id: 'c-01',
        alert_id: alertId,
        user: 'Lead SOC Analyst',
        comment: 'Initial triage completed. Confirmed malicious C2 beaconing pattern. Host isolated.',
        created_at: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
      },
      {
        id: 'c-02',
        alert_id: alertId,
        user: 'Demo Analyst (Read-Only)',
        comment: 'Verified against ThreatFox database: hash matches FIN7 tooling.',
        created_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      },
    ],
  });
}

export async function POST() {
  return NextResponse.json({ status: 'success', id: `c-${Date.now()}` });
}
