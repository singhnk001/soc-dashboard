'use client';

import React from 'react';
import { SEVERITY_STYLES } from '@/lib/config';
import { SeverityLevel } from '@/lib/types';

interface SeverityBadgeProps {
  severity: SeverityLevel | string;
  className?: string;
}

export function SeverityBadge({ severity, className = '' }: SeverityBadgeProps) {
  const norm = (severity || 'info').toLowerCase();
  const style = SEVERITY_STYLES[norm] || SEVERITY_STYLES.info;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border capitalize ${style.bg} ${style.text} ${style.border} ${className}`}
    >
      {norm}
    </span>
  );
}

export default SeverityBadge;
