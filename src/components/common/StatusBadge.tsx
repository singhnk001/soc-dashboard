'use client';

import React from 'react';
import { STATUS_STYLES } from '@/lib/config';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const norm = (status || 'unknown').toLowerCase().replace(' ', '_');
  const style = STATUS_STYLES[norm] || STATUS_STYLES.inactive;
  const label = status ? status.replace('_', ' ') : 'unknown';

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border capitalize ${style.bg} ${style.text} ${style.border} ${className}`}
    >
      {label}
    </span>
  );
}

export default StatusBadge;
