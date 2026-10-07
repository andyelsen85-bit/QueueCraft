import type { ScheduledAllocation } from "./occupancy";

const DAY = 86400000;
const dayNumber = (value: string) => Date.parse(`${value}T00:00:00Z`) / DAY;
const dateOnly = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
const isWorkingDay = (day: number) => {
  const weekday = new Date(day * DAY).getUTCDay();
  return weekday !== 0 && weekday !== 6;
};

/** Inclusive Monday–Friday, including public holidays, without iterating long ranges. */
export function workingDays(start: number, end: number) {
  const count = Math.max(0, end - start + 1);
  let result = Math.floor(count / 7) * 5;
  for (let index = 0; index < count % 7; index++) {
    if (isWorkingDay(start + index)) result++;
  }
  return result;
}

/** Exact concurrent capacity, not a period average that can hide overbooking. */
export function memberAvailability(
  dailyBusinessPercent: number,
  weeklyHours: number | null,
  allocations: ScheduledAllocation[],
  startDate: string,
  endDate: string,
  excludeMilestoneId?: string,
) {
  const start = dayNumber(startDate);
  const end = dayNumber(endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    throw new Error("Invalid availability date range");
  }
  const events = new Map<number, number>([[start, 0], [end + 1, 0]]);
  const add = (day: number, value: number) => events.set(day, (events.get(day) ?? 0) + value);
  for (const allocation of allocations) {
    if (excludeMilestoneId && allocation.milestoneId === excludeMilestoneId) continue;
    const from = Math.max(start, dayNumber(allocation.beginDate));
    const to = Math.min(end, dayNumber(allocation.targetDate));
    if (from <= to) {
      add(from, allocation.allocationPercent);
      add(to + 1, -allocation.allocationPercent);
    }
  }
  const boundaries = [...events.keys()].sort((a, b) => a - b);
  const segments: Array<{
    startDate: string; endDate: string; workingDays: number;
    milestoneAllocationPercent: number; availablePercent: number;
  }> = [];
  let load = 0;
  for (let index = 0; index < boundaries.length - 1; index++) {
    load += events.get(boundaries[index]) ?? 0;
    let from = boundaries[index];
    let to = boundaries[index + 1] - 1;
    const days = workingDays(from, to);
    if (!days) continue;
    while (!isWorkingDay(from)) from++;
    while (!isWorkingDay(to)) to--;
    segments.push({
      startDate: dateOnly(from), endDate: dateOnly(to), workingDays: days,
      milestoneAllocationPercent: load, availablePercent: 100 - dailyBusinessPercent - load,
    });
  }
  return {
    dailyBusinessPercent,
    weeklyHours,
    workingDays: workingDays(start, end),
    minimumAvailablePercent: segments.length
      ? Math.min(...segments.map((segment) => segment.availablePercent)) : null,
    availableHours: weeklyHours == null || !segments.length ? null
      : segments.reduce((sum, segment) =>
          sum + weeklyHours / 5 * segment.workingDays * segment.availablePercent / 100, 0),
    segments,
  };
}
