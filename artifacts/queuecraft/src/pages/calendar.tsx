import * as React from "react"
import { addMonths, differenceInCalendarDays, eachDayOfInterval, endOfMonth, format, isBefore, isAfter, isSameDay, isSameMonth, isWeekend, startOfMonth } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Link } from "wouter"
import { useListTopics } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PriorityBadge, StatusBadge } from "@/components/badges"

const safeDate = (dateStr?: string | null) => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // Noon to avoid DST issues
};

const getBarColors = (status: string) => {
  switch (status) {
    case 'blocked': return 'bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20';
    case 'closed': return 'bg-muted border-border text-muted-foreground hover:bg-muted/80';
    default: return 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20';
  }
};

export function Calendar() {
  const [month, setMonth] = React.useState(() => startOfMonth(new Date()));
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { data: topics, isLoading, isError, refetch } = useListTopics({ limit: 100 });

  const monthStart = React.useMemo(() => startOfMonth(month), [month]);
  const monthEnd = React.useMemo(() => endOfMonth(month), [month]);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const visibleTopics = React.useMemo(() => {
    return (topics ?? [])
      .map(topic => {
        let startD = safeDate(topic.estimatedStartDate);
        let endD = safeDate(topic.estimatedFinishDate) ?? safeDate(topic.targetDate);

        if (!startD && !endD) return null;
        if (startD && !endD) endD = startD;
        if (!startD && endD) startD = endD;

        if (isAfter(startD!, endD!)) {
          const t = startD; startD = endD; endD = t;
        }

        if (isBefore(endD!, monthStart) || isAfter(startD!, monthEnd)) return null;

        return { ...topic, startD: startD!, endD: endD! };
      })
      .filter((t): t is (typeof t & { startD: Date, endD: Date }) => t !== null)
      .sort((a, b) => {
        const startDiff = a.startD.getTime() - b.startD.getTime();
        if (startDiff !== 0) return startDiff;
        return b.endD.getTime() - b.startD.getTime(); // longer first
      });
  }, [topics, monthStart, monthEnd]);

  React.useEffect(() => {
    if (!scrollRef.current || isLoading || isError) return;
    const today = new Date();
    const activeToday = isSameMonth(today, month) && visibleTopics.some(
      (topic) =>
        differenceInCalendarDays(today, topic.startD) >= 0 &&
        differenceInCalendarDays(topic.endD, today) >= 0,
    );
    const focus = activeToday
      ? today
      : visibleTopics[0]
        ? isBefore(visibleTopics[0].startD, monthStart) ? monthStart : visibleTopics[0].startD
        : monthStart;
    scrollRef.current.scrollLeft = Math.max(0, differenceInCalendarDays(focus, monthStart) - 3) * 48;
  }, [month, monthStart, visibleTopics, isLoading, isError]);

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 flex flex-col min-h-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between shrink-0">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Planning calendar</p>
          <h1 className="text-3xl font-bold tracking-tight">Topic Calendar</h1>
          <p className="mt-1 text-muted-foreground">Topics span their estimated start through finish dates. Single dates form a one-day block.</p>
           {topics?.length === 100 && (
             <p className="text-xs text-muted-foreground mt-2">Showing the first 100 topics returned by the server. Additional topics may not appear here.</p>
           )}
        </div>
        <div className="flex items-center gap-2 rounded-md border bg-card p-1 shadow-sm">
          <Button variant="ghost" size="icon" onClick={() => setMonth((value) => addMonths(value, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="w-40 text-center text-sm font-semibold">{format(month, "MMMM yyyy")}</div>
          <Button variant="ghost" size="icon" onClick={() => setMonth((value) => addMonths(value, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <Card className="flex-1 overflow-hidden flex flex-col">
        <CardContent className="p-0 flex flex-col flex-1 overflow-hidden">
           <div ref={scrollRef} className="flex-1 overflow-auto bg-muted/5 max-h-[calc(100vh-16rem)] min-h-[400px]">
            <div className="min-w-max flex flex-col">
              {/* Header Row */}
              <div className="flex border-b bg-card h-14 sticky top-0 z-30 shadow-sm">
                <div className="w-56 sm:w-72 sticky left-0 bg-card border-r flex-shrink-0 flex items-center px-4 font-mono text-xs font-semibold uppercase text-muted-foreground z-40 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]">
                  Topic
                </div>
                <div className="flex flex-1">
                  {days.map(d => (
                    <div key={d.toISOString()} className={`w-12 flex-shrink-0 border-r flex flex-col items-center justify-center text-xs ${isWeekend(d) ? 'bg-muted/30' : ''}`}>
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
                    <div className="w-56 sm:w-72 sticky left-0 bg-card border-r p-4 flex flex-col justify-center gap-2 z-20">
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
                  No topics scheduled for this period.
                </div>
              ) : (
                visibleTopics.map((topic) => {
                  const gridStart = isBefore(topic.startD, monthStart) ? monthStart : topic.startD;
                  const gridEnd = isAfter(topic.endD, monthEnd) ? monthEnd : topic.endD;

                  const startIdx = days.findIndex(d => isSameDay(d, gridStart));
                  const endIdx = days.findIndex(d => isSameDay(d, gridEnd));

                  const sIdx = startIdx >= 0 ? startIdx : 0;
                  const eIdx = endIdx >= 0 ? endIdx : days.length - 1;
                  const span = eIdx - sIdx + 1;

                  const isClippedLeft = isBefore(topic.startD, monthStart);
                  const isClippedRight = isAfter(topic.endD, monthEnd);

                  return (
                    <div key={topic.id} className="flex h-16 border-b hover:bg-muted/30 group">
                      <div className="w-56 sm:w-72 sticky left-0 bg-card group-hover:bg-muted/50 border-r flex-shrink-0 flex flex-col justify-center px-4 overflow-hidden z-20 transition-colors shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]">
                        <Link href={`/topics/${topic.id}`} className="text-sm font-medium hover:underline truncate focus:outline-none focus:ring-1 focus:ring-primary rounded-sm">
                          {topic.title}
                        </Link>
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className="scale-[0.8] origin-left"><PriorityBadge priority={topic.priority} /></div>
                          <div className="scale-[0.8] origin-left -ml-2"><StatusBadge status={topic.status} /></div>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground truncate ml-[-2px]">{topic.department?.name}</span>
                        </div>
                      </div>
                      <div className="flex-1 relative flex">
                        {days.map(d => (
                          <div key={d.toISOString()} className={`w-12 flex-shrink-0 border-r ${isWeekend(d) ? 'bg-muted/30' : ''}`} />
                        ))}
                        <div
                          className="absolute top-2.5 bottom-2.5 z-10 py-[2px]"
                          style={{
                            left: `calc(${sIdx} * 3rem)`,
                            width: `calc(${span} * 3rem)`
                          }}
                        >
                          <Link
                            href={`/topics/${topic.id}`}
                            className={`block h-full border transition-colors flex items-center px-2 overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background
                              ${isClippedLeft ? 'rounded-l-none border-l-0 border-l-transparent' : 'rounded-l-md'}
                              ${isClippedRight ? 'rounded-r-none border-r-0 border-r-transparent' : 'rounded-r-md'}
                              ${getBarColors(topic.status)}
                            `}
                            title={`${topic.title}\n${format(topic.startD, "MMM d")} - ${format(topic.endD, "MMM d")}`}
                          >
                            <span className="text-[11px] font-semibold truncate leading-none">{topic.title}</span>
                          </Link>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
