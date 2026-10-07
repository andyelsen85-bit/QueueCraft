import * as React from "react"
import { addMonths, differenceInCalendarDays, eachDayOfInterval, endOfMonth, format, isBefore, isAfter, isSameDay, isWeekend, startOfMonth } from "date-fns"
import { ChevronRight, Target } from "lucide-react"
import { Link } from "wouter"
import { useListCalendarTopics, useListMembers, useListRoles } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PriorityBadge } from "@/components/badges"
import { DateEditDialog, DateHandles, isoDay, type EditRequest } from "@/components/calendar-date-editing"
import { downloadCalendarCsv, downloadCalendarPdf, selectCalendarExport } from "@/lib/calendar-export"

const safeDate = (dateStr?: string | null) => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // Noon to avoid DST issues
};

type DateRange = { start: Date; end: Date };

const dateRange = (begin?: string | null, target?: string | null): DateRange | null => {
  let start = safeDate(begin);
  let end = safeDate(target);
  if (!start && !end) return null;
  if (!start) start = end;
  if (!end) end = start;
  return isAfter(start!, end!) ? { start: end!, end: start! } : { start: start!, end: end! };
};

const overlapsMonth = (range: DateRange, start: Date, end: Date) =>
  !isBefore(range.end, start) && !isAfter(range.start, end);

const DAY_WIDTH = 28;
const LABEL_WIDTH = 256;
const MONTH_COUNT = 13; // Selected month plus the following 12 months.

const getBarColors = (status: string) => {
  switch (status) {
    case 'completed': return 'bg-emerald-100 border-emerald-300 text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-950 dark:border-emerald-700 dark:text-emerald-200';
    case 'blocked': return 'bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20';
    case 'rejected': return 'bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20';
    case 'returned': return 'bg-amber-100 border-amber-300 text-amber-900 hover:bg-amber-200 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-200';
    case 'pending_validation': return 'bg-yellow-100 border-yellow-300 text-yellow-900 hover:bg-yellow-200 dark:bg-yellow-950 dark:border-yellow-700 dark:text-yellow-200';
    case 'closed': return 'bg-muted border-border text-muted-foreground hover:bg-muted/80';
    case 'in_progress': return 'bg-orange-100 border-orange-300 text-orange-900 hover:bg-orange-200 dark:bg-orange-950 dark:border-orange-700 dark:text-orange-200';
    case 'open': return 'bg-blue-100 border-blue-300 text-blue-900 hover:bg-blue-200 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-200';
    case 'not_started': return 'bg-sky-100 border-sky-300 text-sky-900 hover:bg-sky-200 dark:bg-sky-950 dark:border-sky-700 dark:text-sky-200';
    default: return 'bg-muted border-border text-muted-foreground hover:bg-muted/80';
  }
};

const LEGEND = ["not_started", "open", "in_progress", "pending_validation", "returned", "completed", "blocked", "rejected", "closed"];

function StatusLegend() {
  return (
    <ul aria-label="Bar color legend" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {LEGEND.map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`inline-block h-3 w-5 rounded-sm border ${getBarColors(status)}`} />
          <span className="capitalize">{status.replaceAll("_", " ")}</span>
        </li>
      ))}
    </ul>
  );
}

function TimelineCells({
  days, rangeStart, rangeEnd, range, status, title, href, milestone = false, onEdit, startUnset, endUnset,
}: {
  days: Date[]; rangeStart: Date; rangeEnd: Date; range: DateRange | null;
  status: string; title: string; href: string; milestone?: boolean;
  startUnset?: boolean; endUnset?: boolean;
  onEdit?: (start: Date, end: Date, handle: "start" | "end") => void;
}) {
  const visible = range && overlapsMonth(range, rangeStart, rangeEnd);
  const startIdx = visible ? differenceInCalendarDays(
    isBefore(range.start, rangeStart) ? rangeStart : range.start, rangeStart) : 0;
  const endIdx = visible ? differenceInCalendarDays(
    isAfter(range.end, rangeEnd) ? rangeEnd : range.end, rangeStart) : 0;
  return (
    <div className="relative flex shrink-0" style={{ width: days.length * DAY_WIDTH }}>
      {days.map((day) => (
        <div key={day.toISOString()} className={`shrink-0 border-r ${isWeekend(day) ? 'bg-muted/30' : ''}`}
          style={{ width: DAY_WIDTH }} />
      ))}
      {visible && (
        <div
          className={`absolute z-10 py-[2px] ${milestone ? 'top-2 bottom-2' : 'top-2.5 bottom-2.5'}`}
          style={{ left: startIdx * DAY_WIDTH, width: (endIdx - startIdx + 1) * DAY_WIDTH }}
        >
          <Link
            href={href}
            className={`flex h-full items-center overflow-hidden border px-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background
              ${isBefore(range.start, rangeStart) ? 'rounded-l-none border-l-0' : 'rounded-l-md'}
              ${isAfter(range.end, rangeEnd) ? 'rounded-r-none border-r-0' : 'rounded-r-md'}
              ${getBarColors(status)}`}
            title={`${title}\n${format(range.start, "MMM d, yyyy")} - ${format(range.end, "MMM d, yyyy")}`}
            aria-label={`${title}. ${status.replaceAll("_", " ")}. ${format(range.start, "MMM d, yyyy")} to ${format(range.end, "MMM d, yyyy")}.`}
          >
            <span className="truncate text-[11px] font-semibold leading-none">{title}</span>
          </Link>
        </div>
      )}
      {visible && onEdit && (
        <DateHandles range={range} rangeStart={rangeStart} rangeEnd={rangeEnd} label={title} onCommit={onEdit}
          startUnset={startUnset} endUnset={endUnset} />
      )}
    </div>
  );
}

export function Calendar() {
  const [month, setMonth] = React.useState(() => startOfMonth(new Date()));
  const [roleId, setRoleId] = React.useState("");
  const [memberId, setMemberId] = React.useState("");
  const [expandedTopics, setExpandedTopics] = React.useState<Record<string, boolean>>({});
  const [editRequest, setEditRequest] = React.useState<EditRequest | null>(null);
  const [scope, setScope] = React.useState<"current" | "all">("current");
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { data: topics, isLoading, isError, refetch } = useListCalendarTopics();
  const { data: roles, isLoading: rolesLoading, isError: rolesError, refetch: refetchRoles } = useListRoles();
  const { data: members, isLoading: membersLoading, isError: membersError, refetch: refetchMembers } = useListMembers();
  const sortedRoles = React.useMemo(
    () => [...(roles ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [roles],
  );
  const sortedMembers = React.useMemo(
    () => [...(members ?? [])].filter((member) => member.id !== "local-admin")
      .sort((a, b) => a.name.localeCompare(b.name)),
    [members],
  );

  const months = React.useMemo(() => Array.from({ length: MONTH_COUNT }, (_, index) => {
    const start = addMonths(month, index);
    return { start, days: eachDayOfInterval({ start, end: endOfMonth(start) }) };
  }), [month]);
  const rangeStart = months[0].start;
  const rangeEnd = months[months.length - 1].days.at(-1)!;
  const days = React.useMemo(() => months.flatMap((entry) => entry.days), [months]);
  const today = new Date();
  const todayIndex = differenceInCalendarDays(today, rangeStart);
  const todayLeft = todayIndex >= 0 && todayIndex < days.length
    ? LABEL_WIDTH + todayIndex * DAY_WIDTH + DAY_WIDTH / 2 : null;

  const visibleTopics = React.useMemo(() => {
    return (topics ?? [])
      .filter((topic) => !roleId || topic.roleId === roleId)
      .map(topic => {
        const topicAssigned = !memberId || topic.assignedMemberIds.includes(memberId);
        const schedule = dateRange(topic.estimatedStartDate, topic.estimatedFinishDate ?? topic.targetDate);
        const scheduleInView = schedule && overlapsMonth(schedule, rangeStart, rangeEnd) ? schedule : null;
        const topicRange = topicAssigned ? scheduleInView : null;
        const milestones = topic.milestones
          .filter(milestone => !memberId || milestone.assignedMemberIds.includes(memberId))
          .map(milestone => ({
            ...milestone, range: dateRange(milestone.beginDate, milestone.targetDate),
          }))
          .sort((a, b) => {
            const aStart = a.beginDate?.slice(0, 10);
            const bStart = b.beginDate?.slice(0, 10);
            if (!aStart || !bStart) return aStart ? -1 : bStart ? 1 : 0;
            return aStart.localeCompare(bStart);
          });
        const milestonesInView = milestones.filter(milestone =>
          milestone.range && overlapsMonth(milestone.range, rangeStart, rangeEnd));
        // Keep a non-assigned parent as context for the member's milestones,
        // including undated milestones beneath a scheduled topic.
        const milestoneContextRange = !topicAssigned && milestones.length > 0 ? scheduleInView : null;
        if (!topicRange && !milestoneContextRange && milestonesInView.length === 0) return null;
        const firstMilestone = milestonesInView.reduce<Date | null>(
          (first, milestone) => !first || isBefore(milestone.range!.start, first)
            ? milestone.range!.start : first, null);
        const focusD = topicRange?.start ?? milestoneContextRange?.start ?? firstMilestone!;
        return { ...topic, topicRange, milestones, milestonesInView: milestonesInView.length, focusD };
      })
      .filter((topic): topic is NonNullable<typeof topic> => topic !== null)
      .sort((a, b) => {
        const startDiff = a.focusD.getTime() - b.focusD.getTime();
        if (startDiff !== 0) return startDiff;
        return a.title.localeCompare(b.title);
      });
  }, [topics, roleId, memberId, rangeStart, rangeEnd]);

  const requestTopicEdit = (topic: NonNullable<typeof topics>[number], start: Date, end: Date, handle: "start" | "end") => {
    const rs = topic.estimatedStartDate?.slice(0, 10) ?? null;
    const rf = topic.estimatedFinishDate?.slice(0, 10) ?? null;
    const shown = dateRange(topic.estimatedStartDate, topic.estimatedFinishDate ?? topic.targetDate);
    const sChanged = handle === "start" && (!shown || !isSameDay(start, shown.start));
    const fChanged = handle === "end" && (!shown || !isSameDay(end, shown.end));
    const full = (topics ?? []).find((t) => t.id === topic.id) ?? topic;
    const latest = full.milestones.reduce<string | null>((m, ms) => {
      const t = ms.targetDate?.slice(0, 10) ?? null;
      return t && (!m || t > m) ? t : m;
    }, null);
    setEditRequest({
      kind: "topic", id: topic.id, topicId: topic.id, title: topic.title, rawStart: rs, rawFinish: rf,
      start: sChanged ? isoDay(start) : rs ?? "", finish: fChanged ? isoDay(end) : rf ?? "",
      latestMilestoneTarget: latest, committedFinish: topic.targetDate?.slice(0, 10) ?? null,
    });
  };
  const requestMilestoneEdit = (topicId: string, milestone: { id: string; title: string; beginDate: string | null; targetDate: string | null; range: DateRange | null }, start: Date, end: Date, handle: "start" | "end") => {
    const rs = milestone.beginDate?.slice(0, 10) ?? null;
    const rf = milestone.targetDate?.slice(0, 10) ?? null;
    const r = milestone.range;
    const sChanged = handle === "start" && (!r || !isSameDay(start, r.start));
    const fChanged = handle === "end" && (!r || !isSameDay(end, r.end));
    setEditRequest({
      kind: "milestone", id: milestone.id, topicId, title: milestone.title, rawStart: rs, rawFinish: rf,
      start: sChanged ? isoDay(start) : rs ?? "", finish: fChanged ? isoDay(end) : rf ?? "",
      latestMilestoneTarget: null, committedFinish: null,
    });
  };

  const scopeLabel = scope === "current" ? "Current calendar" : "All schedules";
  const exportSelection = React.useMemo(() => selectCalendarExport(topics ?? [], {
    roleId, memberId, period: scope === "current" ? { start: rangeStart, end: rangeEnd } : undefined,
  }), [topics, roleId, memberId, scope, rangeStart, rangeEnd]);
  const exportDisabled = isLoading || isError || exporting || exportSelection.length === 0;
  const runExport = async (kind: "csv" | "pdf") => {
    if (!topics) return;
    setExporting(true);
    setExportError(null);
    try {
      const period = scope === "current" ? { start: rangeStart, end: rangeEnd } : undefined;
      const selected = exportSelection;
      if (selected.length === 0) throw new Error("Nothing to export for this selection.");
      const options = {
        title: "Topic Calendar",
        roleNames: Object.fromEntries((roles ?? []).map((role) => [role.id, role.name])),
        memberNames: Object.fromEntries((members ?? []).map((member) => [member.id, member.name])),
        period,
        filterLabel: [
          scopeLabel,
          `Role: ${roleId ? sortedRoles.find((role) => role.id === roleId)?.name ?? roleId : "All roles"}`,
          `Member: ${memberId ? sortedMembers.find((member) => member.id === memberId)?.name ?? memberId : "All members"}`,
        ].join("; "),
      };
      if (kind === "csv") downloadCalendarCsv(selected, options);
      else await downloadCalendarPdf(selected, options);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  React.useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [month]);

  const topicsWithMilestones = visibleTopics.filter((topic) => topic.milestones.length > 0);
  const allExpanded = topicsWithMilestones.length > 0 && topicsWithMilestones.every((topic) =>
    expandedTopics[topic.id] ?? (!topic.topicRange && topic.milestones.length > 0));
  const toggleAll = () => {
    setExpandedTopics((current) => {
      const next = { ...current };
      for (const topic of topicsWithMilestones) next[topic.id] = !allExpanded;
      return next;
    });
  };

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 flex flex-col min-h-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between shrink-0">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Planning calendar</p>
          <h1 className="text-3xl font-bold tracking-tight">Topic Calendar</h1>
          <p className="mt-1 text-muted-foreground">Scroll from the selected month through the following 12 months. Expand topics to see their milestones.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Button variant="outline" size="sm" onClick={toggleAll} disabled={isLoading || isError || topicsWithMilestones.length === 0}
            aria-label={allExpanded ? "Collapse all topic milestones" : "Expand all topic milestones"}>
            {allExpanded ? "Collapse all" : "Expand all milestones"}
          </Button>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Role filter
            <select value={roleId} onChange={(event) => setRoleId(event.target.value)}
              disabled={rolesLoading || rolesError}
              className="h-9 w-44 rounded-md border bg-card px-3 text-sm font-medium text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              aria-label="Filter calendar by role">
              <option value="">All roles</option>
              {sortedRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
          </label>
          {rolesError && <Button variant="outline" size="sm" onClick={() => void refetchRoles()}>Retry roles</Button>}
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Member filter
            <select value={memberId} onChange={(event) => setMemberId(event.target.value)}
              disabled={membersLoading || membersError}
              className="h-9 w-44 rounded-md border bg-card px-3 text-sm font-medium text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              aria-label="Filter calendar by member">
              <option value="">All members</option>
              {sortedMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
          </label>
          {membersError && <Button variant="outline" size="sm" onClick={() => void refetchMembers()}>Retry members</Button>}
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Start month
            <input type="month" value={format(month, "yyyy-MM")}
              onChange={(event) => {
                if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) {
                  const [year, monthNumber] = event.target.value.split("-").map(Number);
                  setMonth(new Date(year, monthNumber - 1, 1));
                }
              }}
              className="h-9 rounded-md border bg-card px-3 text-sm font-medium text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Select start month" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Export scope
            <select value={scope} onChange={(event) => setScope(event.target.value as "current" | "all")}
              className="h-9 w-44 rounded-md border bg-card px-3 text-sm font-medium text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Export scope">
              <option value="current">Current calendar</option>
              <option value="all">All schedules</option>
            </select>
          </label>
          <Button variant="outline" size="sm" disabled={exportDisabled} onClick={() => void runExport("csv")}>Export CSV</Button>
          <Button variant="outline" size="sm" disabled={exportDisabled} onClick={() => void runExport("pdf")}>
            {exporting ? "Exporting..." : "Export A0 PDF"}
          </Button>
        </div>
      </div>
      {exportError && <p role="alert" className="shrink-0 text-sm text-destructive">{exportError}</p>}
      <div className="shrink-0"><StatusLegend /></div>

      <DateEditDialog edit={editRequest} onClose={() => setEditRequest(null)} />

      <Card className="flex-1 min-w-0 overflow-hidden flex flex-col">
        <CardContent className="p-0 min-w-0 flex flex-col flex-1 overflow-hidden">
           <div ref={scrollRef} data-calendar-scroll className="flex-1 overflow-auto bg-muted/5 max-h-[calc(100vh-16rem)] min-h-[400px]">
              <div className="relative flex flex-col" style={{ width: LABEL_WIDTH + days.length * DAY_WIDTH }}>
               {todayLeft !== null && (
                 <div className="pointer-events-none absolute inset-y-0 z-[15] w-1 bg-black dark:bg-white"
                   style={{ left: todayLeft - 2 }} aria-hidden="true" />
               )}
              {/* Header Row */}
               <div className="sticky top-0 z-30 flex h-[68px] border-b bg-card shadow-sm">
                 <div className="sticky left-0 z-50 flex shrink-0 items-center border-r bg-card px-4 font-mono text-xs font-semibold uppercase text-muted-foreground shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]"
                   style={{ width: LABEL_WIDTH }}>
                  Topic / milestone
                </div>
                 <div className="flex shrink-0 flex-col">
                   <div className="flex h-7 border-b">
                     {months.map((entry) => (
                       <div key={entry.start.toISOString()} className="shrink-0 border-r bg-muted/30 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider"
                         style={{ width: entry.days.length * DAY_WIDTH }}>
                         {format(entry.start, "MMMM yyyy")}
                       </div>
                     ))}
                   </div>
                   <div className="flex h-10">
                     {days.map(d => (
                       <div key={d.toISOString()} className={`flex shrink-0 flex-col items-center justify-center border-r text-xs ${isWeekend(d) ? 'bg-muted/30' : ''}`}
                         style={{ width: DAY_WIDTH }}>
                         <span className="font-mono text-[10px] uppercase text-muted-foreground">{format(d, "E").charAt(0)}</span>
                         <span className={`mt-0.5 font-medium ${isSameDay(d, today) ? 'rounded-full bg-black text-white dark:bg-white dark:text-black' : ''}`}>{format(d, "d")}</span>
                       </div>
                     ))}
                   </div>
                </div>
                 {todayLeft !== null && (
                   <div className="pointer-events-none absolute inset-y-0 z-40 w-1 bg-black dark:bg-white"
                     style={{ left: todayLeft - 2 }} aria-label={`Today: ${format(today, "MMMM d, yyyy")}`}>
                     <span className="absolute -left-5 top-0 rounded-b bg-black px-1 text-[10px] font-bold text-white dark:bg-white dark:text-black">Today</span>
                   </div>
                 )}
              </div>

              {/* Rows */}
               {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex h-16 border-b">
                     <div className="sticky left-0 z-20 flex shrink-0 flex-col justify-center gap-2 border-r bg-card p-4"
                       style={{ width: LABEL_WIDTH }}>
                      <div className="h-3 w-32 bg-muted rounded animate-pulse" />
                      <div className="h-2 w-24 bg-muted rounded animate-pulse" />
                    </div>
                    <div className="flex items-center px-4">
                      <div className="h-6 w-64 bg-muted rounded animate-pulse opacity-50" />
                    </div>
                  </div>
                ))
               ) : isError ? (
                  <div className="sticky left-0 flex h-48 w-[min(100vw,40rem)] flex-col items-center justify-center gap-3 text-sm text-destructive">
                   <span>Could not load topics for the calendar.</span>
                   <Button variant="outline" size="sm" onClick={() => void refetch()}>Try again</Button>
                 </div>
               ) : visibleTopics.length === 0 ? (
                 <div className="sticky left-0 flex h-48 w-[min(100vw,40rem)] items-center justify-center text-sm text-muted-foreground">
                     {memberId
                       ? `No assigned topics or milestones scheduled for ${sortedMembers.find((member) => member.id === memberId)?.name ?? "this member"}${roleId ? ` in ${sortedRoles.find((role) => role.id === roleId)?.name ?? "this role"}` : ""} in this period.`
                       : roleId
                         ? `No topics or milestones scheduled for ${sortedRoles.find((role) => role.id === roleId)?.name ?? "this role"} in this period.`
                         : "No topics or milestones scheduled for this period."}
                </div>
              ) : (
                 visibleTopics.map((topic) => {
                    const expanded = expandedTopics[topic.id] ??
                      (!topic.topicRange && topic.milestones.length > 0);
                   return (
                     <React.Fragment key={topic.id}>
                       <div className="flex min-h-16 border-b hover:bg-muted/30 group">
                           <div className="sticky left-0 z-20 flex shrink-0 flex-col justify-center border-r bg-card px-3 transition-colors group-hover:bg-muted/50 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]"
                             style={{ width: LABEL_WIDTH }}>
                           <div className="flex min-w-0 items-center gap-1">
                             {topic.milestones.length ? (
                               <button type="button" aria-expanded={expanded}
                                 aria-label={`${expanded ? "Collapse" : "Expand"} milestones for ${topic.title}`}
                                 onClick={() => setExpandedTopics((current) => ({ ...current, [topic.id]: !expanded }))}
                                 className="flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                                 <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
                               </button>
                             ) : <span className="w-7 shrink-0" />}
                             <Link href={`/topics/${topic.id}`} className="min-w-0 truncate rounded-sm text-sm font-medium hover:underline focus:outline-none focus:ring-1 focus:ring-primary">
                               {topic.title}
                             </Link>
                             {topic.milestones.length > 0 && (
                               <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                                 {topic.milestones.length}
                               </span>
                             )}
                           </div>
                           <div className="flex items-start gap-1 py-1.5 pl-7">
                             <div className="scale-[0.8] origin-left"><PriorityBadge priority={topic.priority} /></div>
                             <span className="min-w-0 break-words text-[10px] text-muted-foreground">
                                 {topic.departmentName}
                             </span>
                           </div>
                         </div>
                          <TimelineCells days={days} rangeStart={rangeStart} rangeEnd={rangeEnd}
                           range={topic.topicRange} status={topic.status}
                           title={topic.title} href={`/topics/${topic.id}`}
                            startUnset={!topic.estimatedStartDate}
                            endUnset={!topic.estimatedFinishDate && !topic.targetDate}
                            onEdit={topic.canEditDates ? (s, e, handle) => requestTopicEdit(topic, s, e, handle) : undefined} />
                       </div>
                       {expanded && topic.milestones.map((milestone) => (
                         <div key={milestone.id} className="flex h-12 border-b bg-muted/10">
                             <div className="sticky left-0 z-20 flex shrink-0 items-center gap-2 overflow-hidden border-r bg-card/95 pl-10 pr-2 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]"
                               style={{ width: LABEL_WIDTH }}>
                             <Target className="h-3.5 w-3.5 shrink-0 text-sky-700 dark:text-sky-300" />
                             <div className="min-w-0">
                               <Link href={`/topics/${topic.id}`}
                                 className="block truncate rounded-sm text-xs font-medium hover:underline focus:outline-none focus:ring-1 focus:ring-primary">
                                 {milestone.title}
                               </Link>
                               <div className="truncate text-[10px] text-muted-foreground">
                                 {milestone.range
                                   ? `${format(milestone.range.start, "MMM d")} – ${format(milestone.range.end, "MMM d")}`
                                   : "No dates planned"}
                               </div>
                             </div>
                           </div>
                            <TimelineCells days={days} rangeStart={rangeStart} rangeEnd={rangeEnd}
                             range={milestone.range} status={milestone.status}
                             title={milestone.title} href={`/topics/${topic.id}`} milestone
                              startUnset={!milestone.beginDate} endUnset={!milestone.targetDate}
                              onEdit={milestone.canEditDates ? (s, e, handle) => requestMilestoneEdit(topic.id, milestone, s, e, handle) : undefined} />
                         </div>
                       ))}
                     </React.Fragment>
                   );
                 })
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
