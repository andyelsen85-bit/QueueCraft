/** Use the viewer's local calendar day rather than the UTC day. */
export function localTodayIso(now = new Date()) {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function calendarDate(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return null;
  const day = value.slice(0, 10);
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day
    ? day
    : null;
}

export function isRunningOnDate(
  status: string,
  start: string | null | undefined,
  finish: string | null | undefined,
  today: string,
) {
  const first = calendarDate(start);
  const last = calendarDate(finish);
  const current = calendarDate(today);
  return status === "in_progress" && Boolean(
    first && last && current && first <= current && current <= last,
  );
}
