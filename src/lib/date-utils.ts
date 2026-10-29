import { formatDistanceToNow } from 'date-fns';

/**
 * Safely format distance to now without throwing RangeError: Invalid time value
 */
export function safeDistanceToNow(val: any, fallback = 'Recently'): string {
  if (val === null || val === undefined || val === '') {
    return fallback;
  }
  try {
    let d: Date;
    if (val instanceof Date) {
      d = val;
    } else if (typeof val === 'number') {
      // Unix timestamp: either milliseconds (> 1e11) or seconds
      d = new Date(val > 1e11 ? val : val * 1000);
    } else {
      let str = String(val).trim();
      d = new Date(str);
      if (isNaN(d.getTime())) {
        // Try replacing space with 'T'
        d = new Date(str.replace(' ', 'T'));
      }
    }

    if (isNaN(d.getTime())) {
      return fallback;
    }

    return formatDistanceToNow(d) + ' ago';
  } catch {
    return fallback;
  }
}

/**
 * Safely format a date into a localized string
 */
export function safeFormatDate(val: any, fallback = '—'): string {
  if (!val) return fallback;
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return fallback;
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return fallback;
  }
}
