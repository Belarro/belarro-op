import { isOldLead, OLD_LEAD_DAYS } from '../followups';

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

describe('followups.isOldLead', () => {
  it('threshold is 40 days', () => {
    expect(OLD_LEAD_DAYS).toBe(40);
  });

  it('classifies a 35-day-old lead as NOT old (new-lead flow)', () => {
    expect(isOldLead(daysAgo(35), null)).toBe(false);
  });

  it('classifies a 45-day-old lead as old (re-engage flow)', () => {
    expect(isOldLead(daysAgo(45), null)).toBe(true);
  });

  it('classifies exactly 40 days as NOT old (boundary is exclusive: > 40)', () => {
    expect(isOldLead(daysAgo(40), null)).toBe(false);
  });

  it('classifies 41 days as old', () => {
    expect(isOldLead(daysAgo(41), null)).toBe(true);
  });

  it('falls back to created_at when timestamp is null', () => {
    expect(isOldLead(null, daysAgo(45))).toBe(true);
    expect(isOldLead(null, daysAgo(10))).toBe(false);
  });

  it('treats missing dates as old (fail-safe: unknown age defaults to re-engage)', () => {
    expect(isOldLead(null, null)).toBe(true);
  });

  it('treats unparseable dates as old (fail-safe)', () => {
    expect(isOldLead('not-a-date', null)).toBe(true);
  });

  it('handles DD-MM-YYYY formatted timestamps (legacy Sheet format)', () => {
    const d = new Date();
    d.setDate(d.getDate() - 10);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    expect(isOldLead(`${dd}-${mm}-${yyyy}`, null)).toBe(false);
  });
});
