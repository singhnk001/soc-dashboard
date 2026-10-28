'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingSpinnerProps {
  label?: string;
  message?: string;
  className?: string;
}

export function LoadingSpinner({ label, message, className = '' }: LoadingSpinnerProps) {
  const text = label || message || 'Loading...';
  return (
    <div className={`flex flex-col items-center justify-center py-12 gap-3 text-[var(--text-secondary)] ${className}`}>
      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      <span className="text-xs">{text}</span>
    </div>
  );
}

export default LoadingSpinner;
