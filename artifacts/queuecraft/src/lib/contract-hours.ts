import { displayDateToIso } from "./dates";

export function weeklyAllocationHours(weeklyHours: number | null | undefined, percent: number) {
  if (weeklyHours == null || !Number.isFinite(weeklyHours) || weeklyHours <= 0 || !Number.isFinite(percent)) return null;
  return weeklyHours * percent / 100;
}

function dayNumber(value?: string | null) {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) ? value.slice(0, 10) : displayDateToIso(value);
  if (!iso) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return timestamp / 86400000;
}

/** Inclusive Monday–Friday dates, independent of local timezone and DST. */
export function milestoneWorkingDays(beginDate?: string | null, targetDate?: string | null) {
  const start = dayNumber(beginDate);
  const end = dayNumber(targetDate);
  if (start == null || end == null || start > end) return null;
  const count = end - start + 1;
  let days = Math.floor(count / 7) * 5;
  for (let index = 0; index < count % 7; index++) {
    const weekday = new Date((start + index) * 86400000).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days++;
  }
  return days;
}

export function milestoneAllocationHours(weeklyHours: number | null | undefined, percent: number, beginDate?: string | null, targetDate?: string | null) {
  const weekly = weeklyAllocationHours(weeklyHours, percent);
  const days = milestoneWorkingDays(beginDate, targetDate);
  return weekly == null || days == null ? null : weekly / 5 * days;
}

export function formatHours(hours: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(hours);
}

export function weeklyHoursLabel(weeklyHours: number | null | undefined, percent: number) {
  const hours = weeklyAllocationHours(weeklyHours, percent);
  return hours == null ? "Set weekly contract hours to calculate hours" : `${formatHours(hours)} h/week`;
}

export function milestoneHoursLabel(weeklyHours: number | null | undefined, percent: number, beginDate?: string | null, targetDate?: string | null) {
  if (weeklyHours == null) return "Set weekly contract hours to calculate hours";
  const hours = milestoneAllocationHours(weeklyHours, percent, beginDate, targetDate);
  return hours == null ? "Enter valid milestone dates to calculate hours" : `${formatHours(hours)} h total`;
}
