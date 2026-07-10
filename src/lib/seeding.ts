/**
 * Seeding-date math shared by /api/orders and /api/production.
 *
 * Farm rules (Ron, July 7 2026):
 * - Delivery is always Tuesday.
 * - Seed days: Tuesday for crops that grow >10 days, Friday for crops ≤10 days.
 * - A new order's FIRST delivery is set by its longest crop: seed it at its next
 *   possible slot, deliver on the Tuesday it's ready. Shorter crops in the same
 *   order seed LATER (first delivery − their grow days, snapped back to their
 *   seed day) so everything is ready together.
 * - After the first seed date every crop repeats weekly (biweekly = every 2nd week,
 *   anchored to its first delivery).
 * - On a crop swap, the old crop's pipeline keeps delivering; the new crop's first
 *   delivery is the Tuesday AFTER the old crop's last batch delivers.
 */

export const TUESDAY = 2;
export const FRIDAY = 5;

export function localMidnight(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

// Format date as YYYY-MM-DD using LOCAL time (Berlin). toISOString would shift
// local midnight to the previous day in UTC.
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmt(d: Date): string {
  return d.toLocaleDateString('en-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Which weekday a crop seeds on, by its grow days.
export function seedDayFor(growDays: number): number {
  return growDays > 10 ? TUESDAY : FRIDAY;
}

export function nextDayOnOrAfter(from: Date, day: number): Date {
  const d = localMidnight(from);
  while (d.getDay() !== day) d.setDate(d.getDate() + 1);
  return d;
}

export function lastDayOnOrBefore(from: Date, day: number): Date {
  const d = localMidnight(from);
  while (d.getDay() !== day) d.setDate(d.getDate() - 1);
  return d;
}

export function nextTuesdayOnOrAfter(from: Date): Date {
  return nextDayOnOrAfter(from, TUESDAY);
}

// Delivery Tuesday for a batch seeded on seedDate.
export function deliveryTuesdayFor(seedDate: Date, growDays: number): Date {
  return nextTuesdayOnOrAfter(addDays(seedDate, growDays));
}

// First delivery Tuesday for an order placed on orderDate, driven by the
// longest crop in the order: seed it at its next slot, deliver when ready.
export function alignedFirstDelivery(orderDate: Date, maxGrowDays: number): Date {
  const seed = nextDayOnOrAfter(orderDate, seedDayFor(maxGrowDays));
  return deliveryTuesdayFor(seed, maxGrowDays);
}

// First seed date for a crop whose first delivery is firstDeliveryTuesday:
// count back its grow days, then snap BACK to its seed day so it's ready
// on or before the delivery.
export function firstSeedFor(firstDeliveryTuesday: Date, growDays: number): Date {
  const ideal = addDays(localMidnight(firstDeliveryTuesday), -growDays);
  return lastDayOnOrBefore(ideal, seedDayFor(growDays));
}

// Does this line seed at slot `slotDate` (a Tue/Fri matching the crop's bucket)?
// firstSeed anchors the weekly/biweekly cadence.
export function seedsAtSlot(slotDate: Date, firstSeed: Date, frequency: string | null | undefined, recurring?: boolean): boolean {
  const diffDays = Math.round((localMidnight(slotDate).getTime() - localMidnight(firstSeed).getTime()) / 86400000);
  if (diffDays < 0) return false;
  if (recurring === false) return diffDays === 0;
  if (frequency === 'biweekly') return diffDays % 14 === 0;
  return diffDays % 7 === 0;
}

// Does this line deliver on Tuesday `t`? Anchored to its first delivery.
// recurring===false means exactly that one date, never repeating — used for
// ad-hoc one-off extras added to a single week's delivery (frequency itself
// is DB NOT NULL + CHECK'd to 'weekly'/'biweekly' only, so one-offs can't be
// flagged via a new frequency value and use the recurring column instead).
export function deliversOnTuesday(t: Date, firstDelivery: Date, frequency: string | null | undefined, recurring?: boolean): boolean {
  const diffDays = Math.round((localMidnight(t).getTime() - localMidnight(firstDelivery).getTime()) / 86400000);
  if (diffDays < 0) return false;
  if (recurring === false) return diffDays === 0;
  if (frequency === 'biweekly') return diffDays % 14 === 0;
  return diffDays % 7 === 0;
}

// Last delivery of a line removed/swapped on changeDate: its last batch was
// seeded at the most recent slot on or before the change.
export function lastDeliveryAfterStop(changeDate: Date, growDays: number): Date {
  const lastSeed = lastDayOnOrBefore(changeDate, seedDayFor(growDays));
  return deliveryTuesdayFor(lastSeed, growDays);
}

// Total grow days from a growth procedure row. Respects each stage's
// _enabled toggle — a stage with days filled in but disabled in the Grow
// Procedure UI must not count toward the total (previously every call site
// but the manual seeding-batch POST ignored these flags, so unchecking a
// stage silently left harvest/seed-day math unchanged).
export function growDaysFromProc(proc: any): number {
  if (!proc) return 0;
  const stack = proc.stack_enabled === true ? (proc.stack_days || 0) : 0;
  const blackout = proc.blackout_enabled === true ? (proc.blackout_days || 0) : 0;
  const light = proc.light_enabled === true ? (proc.light_days || 0) : 0;
  return stack + blackout + light;
}

// Grow days for a crop; mixes use their longest component.
export function effectiveGrowDays(
  crop: any,
  procMap: Map<string, any>,
  mixComponentsMap: Map<string, any[]>
): number {
  if (!crop) return 0;
  if (crop.is_mix) {
    let max = 0;
    for (const comp of (mixComponentsMap.get(crop.id) || [])) {
      const d = growDaysFromProc(procMap.get(comp.component_crop_id));
      if (d > max) max = d;
    }
    return max;
  }
  return growDaysFromProc(procMap.get(crop.id));
}
