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

export function isScheduledOnDate(
  start: string | null | undefined,
  finish: string | null | undefined,
  today: string,
) {
  const first = calendarDate(start);
  const last = calendarDate(finish);
  const current = calendarDate(today);
  return Boolean(
    first && last && current && first <= current && current <= last,
  );
}

export function currentDateAssignments<
  T extends { id: string; title: string; estimatedStartDate?: string | null; estimatedFinishDate?: string | null },
  M extends { title: string; beginDate?: string | null; targetDate?: string | null },
>(work: { assigned: T[]; collaborations: T[]; milestones: M[] }, today: string) {
  const compareName = (a: { title: string }, b: { title: string }) =>
    a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
  // Start from the unfiltered assignments: even not-started or completed work
  // belongs here when its scheduled period includes today.
  return {
    topics: [...new Map([...work.assigned, ...work.collaborations]
      .filter(t => isScheduledOnDate(t.estimatedStartDate, t.estimatedFinishDate, today))
      .map(t => [t.id, t])).values()].sort(compareName),
    milestones: work.milestones
      .filter(m => isScheduledOnDate(m.beginDate, m.targetDate, today))
      .sort(compareName),
  };
}
