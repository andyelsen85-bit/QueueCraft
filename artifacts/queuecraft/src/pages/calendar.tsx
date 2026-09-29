import * as React from "react"
import { addMonths, differenceInCalendarDays, eachDayOfInterval, endOfMonth, format, isBefore, isAfter, isSameDay, isWeekend, startOfMonth } from "date-fns"
import { ChevronRight, Target } from "lucide-react"
import { Link } from "wouter"
import { useListCalendarTopics, useListRoles } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PriorityBadge, StatusBadge } from "@/components/badges"

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
const LABEL_WIDTH = 192;
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

function TimelineCells({
  days, rangeStart, rangeEnd, range, status, title, href, milestone = false,
}: {
  days: Date[]; rangeStart: Date; rangeEnd: Date; range: DateRange | null;
  status: string; title: string; href: string; milestone?: boolean;
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
          >
            <span className="truncate text-[11px] font-semibold leading-none">{title}</span>
          </Link>
        </div>
      )}
    </div>
  );
}

export function Calendar() {
  const [month, setMonth] = React.useState(() => startOfMonth(new Date()));
  const [roleId, setRoleId] = React.useState("");
  const [expandedTopics, setExpandedTopics] = React.useState<Record<string, boolean>>({});
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { data: topics, isLoading, isError, refetch } = useListCalendarTopics();
  const { data: roles, isLoading: rolesLoading, isError: rolesError, refetch: refetchRoles } = useListRoles();
  const sortedRoles = React.useMemo(
    () => [...(roles ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [roles],
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
        const schedule = dateRange(topic.estimatedStartDate, topic.estimatedFinishDate ?? topic.targetDate);
        const topicRange = schedule && overlapsMonth(schedule, rangeStart, rangeEnd) ? schedule : null;
        const milestones = topic.milestones
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
        if (!topicRange && milestonesInView.length === 0) return null;
        const firstMilestone = milestonesInView.reduce<Date | null>(
          (first, milestone) => !first || isBefore(milestone.range!.start, first)
            ? milestone.range!.start : first, null);
        const focusD = topicRange?.start ?? firstMilestone!;
        return { ...topic, topicRange, milestones, milestonesInView: milestonesInView.length, focusD };
      })
      .filter((topic): topic is NonNullable<typeof topic> => topic !== null)
      .sort((a, b) => {
        const startDiff = a.focusD.getTime() - b.focusD.getTime();
        if (startDiff !== 0) return startDiff;
        return a.title.localeCompare(b.title);
      });
  }, [topics, roleId, rangeStart, rangeEnd]);

  React.useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [month]);

  const topicsWithMilestones = visibleTopics.filter((topic) => topic.milestones.length > 0);
  const allExpanded = topicsWithMilestones.length > 0 && topicsWithMilestones.every((topic) =>
    expandedTopics[topic.id] ?? (!topic.topicRange && topic.milestonesInView > 0));
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
        </div>
      </div>

      <Card className="flex-1 min-w-0 overflow-hidden flex flex-col">
        <CardContent className="p-0 min-w-0 flex flex-col flex-1 overflow-hidden">
           <div ref={scrollRef} className="flex-1 overflow-auto bg-muted/5 max-h-[calc(100vh-16rem)] min-h-[400px]">
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
                    {roleId
                      ? `No topics or milestones scheduled for ${sortedRoles.find((role) => role.id === roleId)?.name ?? "this role"} in this period.`
                      : "No topics or milestones scheduled for this period."}
                </div>
              ) : (
                 visibleTopics.map((topic) => {
                    const expanded = expandedTopics[topic.id] ??
                      (!topic.topicRange && topic.milestonesInView > 0);
                   return (
                     <React.Fragment key={topic.id}>
                       <div className="flex h-16 border-b hover:bg-muted/30 group">
                           <div className="sticky left-0 z-20 flex shrink-0 flex-col justify-center overflow-hidden border-r bg-card px-3 transition-colors group-hover:bg-muted/50 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]"
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
                           <div className="flex items-center gap-1 pl-7">
                             <div className="scale-[0.8] origin-left"><PriorityBadge priority={topic.priority} /></div>
                             <div className="scale-[0.8] origin-left -ml-2"><StatusBadge status={topic.status} /></div>
                             <span className="truncate text-[10px] text-muted-foreground">
                                {topic.topicRange ? topic.departmentName : "Dated milestones"}
                             </span>
                           </div>
                         </div>
                          <TimelineCells days={days} rangeStart={rangeStart} rangeEnd={rangeEnd}
                           range={topic.topicRange} status={topic.status}
                           title={topic.title} href={`/topics/${topic.id}`} />
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
                                   : "No dates planned"} · {milestone.status.replaceAll("_", " ")}
                               </div>
                             </div>
                           </div>
                            <TimelineCells days={days} rangeStart={rangeStart} rangeEnd={rangeEnd}
                             range={milestone.range} status={milestone.status}
                             title={milestone.title} href={`/topics/${topic.id}`} milestone />
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
