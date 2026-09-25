import * as React from "react"
import { addMonths, differenceInCalendarDays, eachDayOfInterval, endOfMonth, format, isBefore, isAfter, isSameDay, isSameMonth, isWeekend, startOfMonth } from "date-fns"
import { ChevronLeft, ChevronRight, Target } from "lucide-react"
import { Link } from "wouter"
import { useListCalendarTopics } from "@workspace/api-client-react"
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

const getBarColors = (status: string, milestone: boolean) => {
  switch (status) {
    case 'completed': return 'bg-emerald-100 border-emerald-300 text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-950 dark:border-emerald-700 dark:text-emerald-200';
    case 'blocked': return 'bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20';
    case 'returned': return 'bg-amber-100 border-amber-300 text-amber-900 hover:bg-amber-200 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-200';
    case 'closed': return 'bg-muted border-border text-muted-foreground hover:bg-muted/80';
    default: return milestone
      ? 'bg-sky-100 border-sky-300 text-sky-900 hover:bg-sky-200 dark:bg-sky-950 dark:border-sky-700 dark:text-sky-200'
      : 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20';
  }
};

function TimelineCells({
  days, monthStart, monthEnd, range, status, title, href, milestone = false,
}: {
  days: Date[]; monthStart: Date; monthEnd: Date; range: DateRange | null;
  status: string; title: string; href: string; milestone?: boolean;
}) {
  const visible = range && overlapsMonth(range, monthStart, monthEnd);
  const startIdx = visible ? differenceInCalendarDays(
    isBefore(range.start, monthStart) ? monthStart : range.start, monthStart) : 0;
  const endIdx = visible ? differenceInCalendarDays(
    isAfter(range.end, monthEnd) ? monthEnd : range.end, monthStart) : 0;
  return (
    <div className="flex-1 min-w-0 relative flex">
      {days.map((day) => (
        <div key={day.toISOString()} className={`min-w-6 flex-1 border-r ${isWeekend(day) ? 'bg-muted/30' : ''}`} />
      ))}
      {visible && (
        <div
          className={`absolute z-10 py-[2px] ${milestone ? 'top-2 bottom-2' : 'top-2.5 bottom-2.5'}`}
          style={{ left: `${startIdx / days.length * 100}%`, width: `${(endIdx - startIdx + 1) / days.length * 100}%` }}
        >
          <Link
            href={href}
            className={`flex h-full items-center overflow-hidden border px-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background
              ${isBefore(range.start, monthStart) ? 'rounded-l-none border-l-0' : 'rounded-l-md'}
              ${isAfter(range.end, monthEnd) ? 'rounded-r-none border-r-0' : 'rounded-r-md'}
              ${getBarColors(status, milestone)}`}
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
  const [expandedTopics, setExpandedTopics] = React.useState<Record<string, boolean>>({});
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { data: topics, isLoading, isError, refetch } = useListCalendarTopics();

  const monthStart = React.useMemo(() => startOfMonth(month), [month]);
  const monthEnd = React.useMemo(() => endOfMonth(month), [month]);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const visibleTopics = React.useMemo(() => {
    return (topics ?? [])
      .map(topic => {
        const schedule = dateRange(topic.estimatedStartDate, topic.estimatedFinishDate ?? topic.targetDate);
        const topicRange = schedule && overlapsMonth(schedule, monthStart, monthEnd) ? schedule : null;
        const milestones = topic.milestones.map(milestone => ({
          ...milestone, range: dateRange(milestone.beginDate, milestone.targetDate),
        }));
        const milestonesThisMonth = milestones.filter(milestone =>
          milestone.range && overlapsMonth(milestone.range, monthStart, monthEnd));
        if (!topicRange && milestonesThisMonth.length === 0) return null;
        const firstMilestone = milestonesThisMonth.reduce<Date | null>(
          (first, milestone) => !first || isBefore(milestone.range!.start, first)
            ? milestone.range!.start : first, null);
        const focusD = topicRange?.start ?? firstMilestone!;
        return { ...topic, topicRange, milestones, milestonesThisMonth: milestonesThisMonth.length, focusD };
      })
      .filter((topic): topic is NonNullable<typeof topic> => topic !== null)
      .sort((a, b) => {
        const startDiff = a.focusD.getTime() - b.focusD.getTime();
        if (startDiff !== 0) return startDiff;
        return a.title.localeCompare(b.title);
      });
  }, [topics, monthStart, monthEnd]);

  React.useEffect(() => {
    if (!scrollRef.current || isLoading || isError) return;
    if (scrollRef.current.scrollWidth <= scrollRef.current.clientWidth) {
      scrollRef.current.scrollLeft = 0;
      return;
    }
    const today = new Date();
    const activeToday = isSameMonth(today, month) && visibleTopics.some(
      (topic) =>
        (topic.topicRange && differenceInCalendarDays(today, topic.topicRange.start) >= 0 &&
          differenceInCalendarDays(topic.topicRange.end, today) >= 0) ||
        topic.milestones.some(milestone => milestone.range &&
          differenceInCalendarDays(today, milestone.range.start) >= 0 &&
          differenceInCalendarDays(milestone.range.end, today) >= 0),
    );
    const focus = activeToday
      ? today
      : visibleTopics[0]
        ? isBefore(visibleTopics[0].focusD, monthStart) ? monthStart : visibleTopics[0].focusD
        : monthStart;
    const dayWidth = scrollRef.current.querySelector<HTMLElement>("[data-calendar-day]")?.getBoundingClientRect().width ?? 24;
    scrollRef.current.scrollLeft = Math.max(0, differenceInCalendarDays(focus, monthStart) - 3) * dayWidth;
  }, [month, monthStart, visibleTopics, isLoading, isError]);

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 flex flex-col min-h-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between shrink-0">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Planning calendar</p>
          <h1 className="text-3xl font-bold tracking-tight">Topic Calendar</h1>
          <p className="mt-1 text-muted-foreground">Expand a topic to see its milestones. Dated milestones appear even when the topic has no dates.</p>
        </div>
        <div className="flex items-center gap-2 rounded-md border bg-card p-1 shadow-sm">
          <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => setMonth((value) => addMonths(value, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="w-40 text-center text-sm font-semibold">{format(month, "MMMM yyyy")}</div>
          <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => setMonth((value) => addMonths(value, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <Card className="flex-1 min-w-0 overflow-hidden flex flex-col">
        <CardContent className="p-0 min-w-0 flex flex-col flex-1 overflow-hidden">
           <div ref={scrollRef} className="flex-1 overflow-auto bg-muted/5 max-h-[calc(100vh-16rem)] min-h-[400px]">
             <div className="w-full min-w-[936px] flex flex-col">
              {/* Header Row */}
              <div className="flex border-b bg-card h-14 sticky top-0 z-30 shadow-sm">
                <div className="w-48 sticky left-0 bg-card border-r flex-shrink-0 flex items-center px-4 font-mono text-xs font-semibold uppercase text-muted-foreground z-40 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]">
                  Topic / milestone
                </div>
                <div className="flex flex-1 min-w-0">
                  {days.map(d => (
                    <div key={d.toISOString()} data-calendar-day className={`min-w-6 flex-1 border-r flex flex-col items-center justify-center text-xs ${isWeekend(d) ? 'bg-muted/30' : ''}`}>
                      <span className="text-muted-foreground font-mono text-[10px] uppercase">{format(d, "E").charAt(0)}</span>
                      <span className={`font-medium mt-0.5 ${isSameDay(d, new Date()) ? 'bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center' : ''}`}>{format(d, "d")}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rows */}
               {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex h-16 border-b">
                     <div className="w-48 sticky left-0 bg-card border-r p-4 flex flex-col justify-center gap-2 z-20">
                      <div className="h-3 w-32 bg-muted rounded animate-pulse" />
                      <div className="h-2 w-24 bg-muted rounded animate-pulse" />
                    </div>
                    <div className="flex-1 flex items-center px-4">
                      <div className="h-6 w-64 bg-muted rounded animate-pulse opacity-50" />
                    </div>
                  </div>
                ))
               ) : isError ? (
                 <div className="h-48 flex flex-col gap-3 items-center justify-center text-sm text-destructive sticky left-0 w-full">
                   <span>Could not load topics for the calendar.</span>
                   <Button variant="outline" size="sm" onClick={() => void refetch()}>Try again</Button>
                 </div>
               ) : visibleTopics.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-sm text-muted-foreground sticky left-0 w-full">
                   No topics or milestones scheduled for this period.
                </div>
              ) : (
                 visibleTopics.map((topic) => {
                   const expanded = expandedTopics[topic.id] ??
                     (!topic.topicRange && topic.milestonesThisMonth > 0);
                   return (
                     <React.Fragment key={topic.id}>
                       <div className="flex h-16 border-b hover:bg-muted/30 group">
                          <div className="w-48 sticky left-0 bg-card group-hover:bg-muted/50 border-r flex-shrink-0 flex flex-col justify-center px-3 overflow-hidden z-20 transition-colors shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]">
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
                               {topic.topicRange ? topic.departmentName : "Milestones this month"}
                             </span>
                           </div>
                         </div>
                         <TimelineCells days={days} monthStart={monthStart} monthEnd={monthEnd}
                           range={topic.topicRange} status={topic.status}
                           title={topic.title} href={`/topics/${topic.id}`} />
                       </div>
                       {expanded && topic.milestones.map((milestone) => (
                         <div key={milestone.id} className="flex h-12 border-b bg-muted/10">
                            <div className="w-48 sticky left-0 z-20 flex shrink-0 items-center gap-2 overflow-hidden border-r bg-card/95 pl-10 pr-2 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]">
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
                           <TimelineCells days={days} monthStart={monthStart} monthEnd={monthEnd}
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
