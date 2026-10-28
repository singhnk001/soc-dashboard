"use client";
import React, { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, Loader2, ExternalLink, AlertTriangle } from "lucide-react";

interface TIHit {
  indicator: string;
  type: string;
  feed_name: string;
  feed_id: string;
}

interface Props {
  /** Raw text blobs to mine for IOCs (description, raw_log, source IP, etc.) */
  texts: string[];
  /** Optional explicit indicators to always check (e.g. source IP field) */
  explicit?: string[];
}

// Regex patterns to extract IOCs from free text
const PATTERNS = {
  IPv4: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
  // SHA256
  SHA256: /\b[0-9a-fA-F]{64}\b/g,
  // MD5
  MD5: /\b[0-9a-fA-F]{32}\b/g,
  // Domain (simple)
  Domain: /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+(?:com|net|org|io|ru|cn|de|uk|fr|info|biz|xyz|top|club|online|site|tk|ml|ga|cf|gq)\b/gi,
  // URL
  URL: /https?:\/\/[^\s"'<>]+/gi,
};

// Skip RFC-1918 private IPs and localhost — no TI value
const PRIVATE_IP = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.0\.0\.0|255\.255)/;

function extractIOCs(texts: string[], explicit: string[]): string[] {
  const found = new Set<string>(explicit.filter(Boolean).map(s => s.trim()));
  const combined = texts.join(" ");

  for (const [, regex] of Object.entries(PATTERNS)) {
    const r = new RegExp(regex.source, regex.flags);
    let m;
    while ((m = r.exec(combined)) !== null) {
      const val = m[0].trim().replace(/[.,;]$/, "");
      if (val.length > 3) found.add(val);
    }
  }

  // Filter out private IPs
  return Array.from(found).filter(v => !PRIVATE_IP.test(v)).slice(0, 40);
}

const feedColor: Record<string, string> = {
  "OTX": "bg-orange-500/10 text-orange-400 border-orange-500/20",
  "Community": "bg-purple-500/10 text-purple-400 border-purple-500/20",
  "ThreatFox": "bg-red-500/10 text-red-400 border-red-500/20",
  "URLhaus": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "CISA": "bg-rose-500/10 text-rose-400 border-rose-500/20",
  "AbuseIPDB": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  default: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
};

function feedBadgeClass(feedName: string): string {
  for (const [key, cls] of Object.entries(feedColor)) {
    if (feedName.toLowerCase().includes(key.toLowerCase())) return cls;
  }
  return feedColor.default;
}

export default function TIEnrichment({ texts, explicit = [] }: Props) {
  const [hits, setHits] = useState<TIHit[] | null>(null);
  const [iocs, setIocs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const extracted = extractIOCs(texts, explicit);
    setIocs(extracted);
    if (extracted.length === 0) {
      setHits([]);
      return;
    }
    setLoading(true);
    setError("");
    fetch("/api/ti/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ indicators: extracted }),
    })
      .then(r => r.json())
      .then(d => setHits(d.hits || []))
      .catch(() => setError("TI lookup failed"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texts.join("|"), explicit.join("|")]);

  if (iocs.length === 0 && !loading) return null;

  return (
    <div className="mt-4 rounded-lg border border-[var(--border-color)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <ShieldAlert size={15} className="text-blue-400" />
          Threat Intelligence Enrichment
        </div>
        {loading ? (
          <Loader2 size={14} className="animate-spin text-gray-400" />
        ) : hits !== null ? (
          hits.length > 0 ? (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
              <AlertTriangle size={11} /> {hits.length} IOC{hits.length > 1 ? "s" : ""} matched
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              <ShieldCheck size={11} /> No known IOCs
            </span>
          )
        ) : null}
      </div>

      <div className="px-4 py-3 bg-[var(--bg-card)]">
        {/* Extracted IOCs chips */}
        {iocs.length > 0 && (
          <div className="mb-3">
            <div className="text-xs text-gray-500 uppercase font-medium mb-1.5">Extracted Indicators ({iocs.length})</div>
            <div className="flex flex-wrap gap-1.5">
              {iocs.map(ioc => {
                const isHit = hits?.some(h => h.indicator === ioc);
                return (
                  <span
                    key={ioc}
                    className={`px-2 py-0.5 rounded text-xs font-mono border transition-colors ${
                      isHit
                        ? "bg-rose-500/15 text-rose-300 border-rose-500/30 font-semibold"
                        : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-color)]"
                    }`}
                    title={isHit ? "⚠️ Matched in threat intelligence feed" : "Not found in local TI feeds"}
                  >
                    {isHit && "⚠️ "}
                    {ioc.length > 50 ? ioc.substring(0, 47) + "..." : ioc}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Hits table */}
        {loading && (
          <div className="text-xs text-gray-500 animate-pulse">Checking {iocs.length} indicator{iocs.length > 1 ? "s" : ""} against threat intel feeds...</div>
        )}

        {error && (
          <div className="text-xs text-rose-400">{error}</div>
        )}

        {!loading && hits && hits.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 uppercase font-medium mb-2">Feed Matches</div>
            <div className="space-y-1.5">
              {hits.map((h, i) => (
                <div key={i} className="flex items-center justify-between gap-3 bg-rose-500/5 border border-rose-500/15 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <AlertTriangle size={13} className="text-rose-400 shrink-0" />
                    <span className="font-mono text-xs text-rose-300 truncate">{h.indicator}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded border border-[var(--border-color)]">
                      {h.type}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${feedBadgeClass(h.feed_name)}`}>
                      {h.feed_name.length > 30 ? h.feed_name.substring(0, 27) + "..." : h.feed_name}
                    </span>
                    <a
                      href="/threat-intel"
                      className="p-1 text-gray-500 hover:text-blue-400 transition-colors"
                      title="View in Threat Intel"
                    >
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && hits && hits.length === 0 && iocs.length > 0 && (
          <div className="text-xs text-gray-500">
            {iocs.length} indicator{iocs.length > 1 ? "s" : ""} checked — none matched local TI feeds.
            <span className="text-gray-600"> (Sync more feeds in <a href="/threat-intel" className="text-blue-400 hover:underline">Threat Intel</a>)</span>
          </div>
        )}
      </div>
    </div>
  );
}
