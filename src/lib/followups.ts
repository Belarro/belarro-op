// A lead older than this many days gets the re-engage flow (4 stages) instead
// of the new-lead flow (5 stages). Ron's call, July 14, 2026: 40 days.
export const OLD_LEAD_DAYS = 40;

export function isOldLead(timestamp: string | null, createdAt: string | null): boolean {
  const dateStr = timestamp || createdAt;
  if (!dateStr) return true;
  const cleaned = String(dateStr).trim()
    .replace(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/, '$3-$2-$1')
    .replace(' ', 'T');
  const date = new Date(cleaned);
  if (isNaN(date.getTime())) return true;
  const diffDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > OLD_LEAD_DAYS;
}
