/**
 * src/lib/config.ts
 * Centralized application constants, styling tokens, and environment parameters.
 */

export const APP_CONFIG = {
  name: 'SOC Dashboard',
  version: '2.0.0',
  apiPrefix: '/api',
  refreshIntervals: {
    default: 30, // seconds
    fast: 10,
    slow: 60,
  },
  pagination: {
    defaultLimit: 50,
    maxLimit: 200,
  },
} as const;

export const SEVERITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  critical: {
    bg: 'bg-red-500/15',
    text: 'text-red-400',
    border: 'border-red-500/30',
  },
  high: {
    bg: 'bg-orange-500/15',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
  },
  medium: {
    bg: 'bg-yellow-500/15',
    text: 'text-yellow-400',
    border: 'border-yellow-500/30',
  },
  low: {
    bg: 'bg-blue-500/15',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
  },
  info: {
    bg: 'bg-gray-500/10',
    text: 'text-gray-400',
    border: 'border-gray-500/20',
  },
};

export const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  new: {
    bg: 'bg-red-500/15',
    text: 'text-red-400',
    border: 'border-red-500/30',
  },
  investigating: {
    bg: 'bg-yellow-500/15',
    text: 'text-yellow-400',
    border: 'border-yellow-500/30',
  },
  resolved: {
    bg: 'bg-green-500/15',
    text: 'text-green-400',
    border: 'border-green-500/30',
  },
  false_positive: {
    bg: 'bg-gray-500/15',
    text: 'text-gray-400',
    border: 'border-gray-500/30',
  },
  healthy: {
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
  },
  inactive: {
    bg: 'bg-zinc-500/15',
    text: 'text-zinc-400',
    border: 'border-zinc-500/30',
  },
};

export const CRITICALITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/40',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
};
