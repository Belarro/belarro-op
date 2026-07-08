// Ported from saletracker/src/utils/dateUtils.js — follow-up date snapping
// only (the delivery-date calculator in the original file is superseded by
// src/lib/seeding.ts and intentionally not ported).

export function toISODateString(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toEUDateString(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

// Follow-ups are batched to Monday and Thursday mornings (field visit days:
// Wed/Thu/Fri) — max 3 business days between action and follow-up.
const FOLLOW_UP_DAYS = [1, 4]; // Monday, Thursday

export function snapToFollowUpDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  if (FOLLOW_UP_DAYS.includes(dow)) return d;
  let bestDiff = Infinity;
  for (const target of FOLLOW_UP_DAYS) {
    const diff = (target - dow + 7) % 7;
    if (diff > 0 && diff < bestDiff) bestDiff = diff;
  }
  d.setDate(d.getDate() + bestDiff);
  return d;
}

export function calculateSnappedFollowUpDate(daysAhead: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return toISODateString(snapToFollowUpDay(date));
}
