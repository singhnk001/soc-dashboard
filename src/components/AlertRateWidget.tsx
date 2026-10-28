'use client';

/**
 * AlertRateWidget — Example custom widget
 *
 * HOW TO ADD A NEW CUSTOM WIDGET TO THE DASHBOARD
 * ════════════════════════════════════════════════
 *
 * STEP 1 — Create this file (src/components/YourWidget.tsx)
 *   • Keep it self-contained: fetch its own data or accept props from the parent.
 *   • Use CSS variables (var(--bg-card), var(--text-primary), etc.) — never hardcode colors.
 *   • Re-use Recharts components already in the project (no new chart libs needed).
 *
 * STEP 2 — Register it in ALL_WIDGETS (src/app/page.tsx)
 *   Add one entry to the ALL_WIDGETS array at the top of page.tsx:
 *
 *     { id: 'alert_rate', label: 'Alert Rate Sparkline', defaultOn: true },
 *
 * STEP 3 — Import and render it in page.tsx
 *   Import:
 *     import AlertRateWidget from '@/components/AlertRateWidget';
 *
 *   Add a render block (anywhere in the JSX, controlled by isVisible):
 *     {isVisible('alert_rate') && <AlertRateWidget />}
 *
 * STEP 4 — Done. The widget appears in:
 *   • The dashboard page
 *   • The "Customize" panel (toggle + drag-to-reorder)
 *   • localStorage persistence (visible/hidden state survives refresh)
 *
 * THAT'S IT — no other files to touch.
 */

import React, { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface HourBucket {
  hour: string;   // "14:00", "15:00" …
  count: number;
}

interface AlertRateData {
  buckets: HourBucket[];
  total_24h: number;
  prev_24h: number;   // previous 24h for trend
}

export default function AlertRateWidget() {
  const [data, setData]       = useState<AlertRateData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch('/api/stats');
        if (!r.ok) throw new Error();
        const s = await r.json();

        // Build hourly buckets from logs_by_hour (already in stats)
        // logs_by_hour shape: [{ hour: "2026-09-30T14:00:00", count: N }, ...]
        const raw: { hour: string; count: number }[] = s.logs_by_hour || [];
        const buckets: HourBucket[] = raw.slice(-24).map(b => ({
          hour: new Date(b.hour).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          count: b.count,
        }));

        const total = buckets.reduce((a, b) => a + b.count, 0);
        const half  = Math.floor(buckets.length / 2);
        const prev  = buckets.slice(0, half).reduce((a, b) => a + b.count, 0);
        const curr  = buckets.slice(half).reduce((a, b) => a + b.count, 0);

        setData({ buckets, total_24h: total, prev_24h: prev });
        // curr / prev for trend (kept in state for display)
        setTrend(prev === 0 ? 0 : Math.round(((curr - prev) / prev) * 100));
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const [trend, setTrend] = useState<number>(0);

  const TrendIcon  = trend > 5 ? TrendingUp : trend < -5 ? TrendingDown : Minus;
  const trendColor = trend > 5 ? 'text-red-400' : trend < -5 ? 'text-green-400' : 'text-gray-400';

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Alert Rate (24 h)</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Events logged per hour</p>
        </div>
        {!loading && data && (
          <div className="text-right">
            <div className="text-2xl font-bold text-[var(--text-primary)]">
              {data.total_24h.toLocaleString()}
            </div>
            <div className={`flex items-center justify-end gap-1 text-xs font-medium ${trendColor}`}>
              <TrendIcon size={12} />
              {trend > 0 ? '+' : ''}{trend}% vs prev 12h
            </div>
          </div>
        )}
        {loading && (
          <div className="text-2xl font-bold text-[var(--text-secondary)]">—</div>
        )}
      </div>

      {/* Sparkline */}
      <div className="h-[80px] w-full">
        {loading ? (
          <div className="h-full flex items-center justify-center text-xs text-[var(--text-secondary)]">
            Loading…
          </div>
        ) : !data || data.buckets.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-[var(--text-secondary)]">
            No data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.buckets} margin={{ top: 4, right: 4, left: -30, bottom: 0 }}>
              <defs>
                <linearGradient id="alertRateGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="hour"
                tick={{ fontSize: 10, fill: '#6b7280' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis hide />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1f2e', border: '1px solid #374151', color: '#fff', fontSize: 11 }}
                formatter={(v: number) => [v.toLocaleString(), 'Events']}
                labelStyle={{ color: '#9ca3af' }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#alertRateGrad)"
                dot={false}
                activeDot={{ r: 3, fill: '#6366f1' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
