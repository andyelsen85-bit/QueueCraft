import * as React from "react"
import { useGetOccupancyOverview, getGetOccupancyOverviewQueryKey } from "@workspace/api-client-react"
import { useQueries } from "@tanstack/react-query"
import { format, startOfWeek, addWeeks, subWeeks, parseISO, startOfMonth, endOfMonth, eachWeekOfInterval, addMonths, subMonths } from "date-fns"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { ChevronLeft, ChevronRight, AlertTriangle, Calendar as CalendarIcon, Briefcase } from "lucide-react"

export function Occupancy() {
  const [currentWeek, setCurrentWeek] = React.useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [view, setView] = React.useState<"week" | "month">("week")

  const weekStartStr = format(currentWeek, 'yyyy-MM-dd')
  
  const { data: weeklyOverviews, isLoading: weeklyLoading } = useGetOccupancyOverview({ weekStart: weekStartStr }, { query: { queryKey: getGetOccupancyOverviewQueryKey({ weekStart: weekStartStr }), enabled: view === "week" } })
  const monthWeeks = React.useMemo(() => eachWeekOfInterval({ start: startOfMonth(currentWeek), end: endOfMonth(currentWeek) }, { weekStartsOn: 1 }).map((date) => format(date, "yyyy-MM-dd")), [currentWeek])
  const monthQueries = useQueries({
    queries: monthWeeks.map((weekStart) => ({
      queryKey: getGetOccupancyOverviewQueryKey({ weekStart }),
      queryFn: async () => {
        const response = await fetch(`/api/occupancy/overview?weekStart=${weekStart}`, { credentials: "include" })
        if (!response.ok) throw new Error("Occupancy data could not be loaded")
        return response.json()
      },
      enabled: view === "month",
    })),
  })
  const monthLoading = monthQueries.some((query) => query.isLoading)
  const monthlyOverviews = React.useMemo(() => {
    const weeks = monthQueries.flatMap((query) => query.data ?? []) as any[]
    const byMember = new Map<string, any[]>()
    weeks.forEach((overview) => byMember.set(overview.member.id, [...(byMember.get(overview.member.id) ?? []), overview]))
    return [...byMember.values()].map((entries) => {
      const sample = entries[0]
      const divisor = entries.length
      const topics = new Map<string, { topicId: string; title: string; allocationPercent: number }>()
      entries.forEach((entry) => entry.topics.forEach((topic: any) => {
        const current = topics.get(topic.topicId) ?? { ...topic, allocationPercent: 0 }
        current.allocationPercent += topic.allocationPercent / divisor
        topics.set(topic.topicId, current)
      }))
      const topicAllocationPercent = Math.round(entries.reduce((sum, entry) => sum + entry.topicAllocationPercent, 0) / divisor)
      const dailyBusinessPercent = sample.dailyBusinessPercent
      const totalOccupancyPercent = dailyBusinessPercent + topicAllocationPercent
      return { ...sample, dailyBusinessPercent, topics: [...topics.values()].map((topic) => ({ ...topic, allocationPercent: Math.round(topic.allocationPercent) })), topicAllocationPercent, totalOccupancyPercent, availablePercent: 100 - totalOccupancyPercent, overAllocated: totalOccupancyPercent > 100 }
    })
  }, [monthQueries])
  const overviews = view === "week" ? weeklyOverviews : monthlyOverviews
  const isLoading = view === "week" ? weeklyLoading : monthLoading

  const goNextWeek = () => setCurrentWeek(prev => view === "week" ? addWeeks(prev, 1) : addMonths(prev, 1))
  const goPrevWeek = () => setCurrentWeek(prev => view === "week" ? subWeeks(prev, 1) : subMonths(prev, 1))

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      const date = parseISO(e.target.value)
      if (!isNaN(date.getTime())) {
        setCurrentWeek(startOfWeek(date, { weekStartsOn: 1 }))
      }
    }
  }

  return (
    <div className="flex-1 space-y-6 p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Capacity Planning</p>
          <h1 className="text-3xl font-bold tracking-tight">Occupancy Overview</h1>
          <p className="text-muted-foreground mt-1">Review team capacity, BAU commitments, and topic allocations by week or month.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 bg-muted/30 p-1 rounded-md border">
          <div className="flex rounded-sm border bg-background p-0.5">
            <Button size="sm" variant={view === "week" ? "default" : "ghost"} onClick={() => setView("week")}>Week</Button>
            <Button size="sm" variant={view === "month" ? "default" : "ghost"} onClick={() => setView("month")}>Month</Button>
          </div>
          <Button variant="ghost" size="icon" onClick={goPrevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="relative">
            <CalendarIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              type={view === "week" ? "date" : "month"}
              value={view === "week" ? weekStartStr : format(currentWeek, "yyyy-MM")}
              onChange={handleDateChange}
              className="w-[160px] pl-9 h-9 bg-transparent border-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <Button variant="ghost" size="icon" onClick={goNextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-[200px] w-full" />
          <Skeleton className="h-[200px] w-full" />
        </div>
      ) : !overviews || overviews.length === 0 ? (
        <div className="p-12 text-center text-sm text-muted-foreground border-2 border-dashed border-muted rounded-sm">
          No active members found.
        </div>
      ) : (
        <div className="grid gap-6">
          {overviews.map((overview) => {
            const isOver = overview.overAllocated
            
            return (
              <Card key={overview.member.id} className={`overflow-hidden transition-colors ${isOver ? 'border-destructive/50 shadow-sm shadow-destructive/10' : ''}`}>
                <CardHeader className={`border-b flex flex-row items-start sm:items-center justify-between space-y-0 p-4 ${isOver ? 'bg-destructive/5' : 'bg-muted/10'}`}>
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12 border bg-background">
                      <AvatarFallback className="font-bold">{overview.member.initials}</AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-lg">{overview.member.name}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        {overview.member.title || 'Member'}
                        {isOver && (
                          <span className="inline-flex items-center text-xs font-semibold text-destructive bg-destructive/10 px-2 py-0.5 rounded-sm">
                            <AlertTriangle className="h-3 w-3 mr-1" /> Overallocated ({overview.totalOccupancyPercent}%)
                          </span>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6 mt-4 sm:mt-0">
                    <div className="text-center">
                      <div className="text-2xl font-bold tracking-tight text-primary">
                        {overview.availablePercent}%
                      </div>
                      <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider">
                        Available
                      </div>
                    </div>
                    <div className="w-px h-10 bg-border hidden sm:block"></div>
                    <div className="text-center hidden sm:block">
                      <div className="text-xl font-semibold tracking-tight">
                        {overview.totalOccupancyPercent}%
                      </div>
                      <div className="text-xs font-mono uppercase text-muted-foreground tracking-wider">
                        Total Load
                      </div>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="p-0">
                  <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-border">
                    {/* BAU Section */}
                    <div className="sm:w-1/3 p-4 bg-muted/5">
                      <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground">
                        <Briefcase className="h-4 w-4" /> Daily Business (BAU)
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-sm border bg-background">
                        <span className="text-sm font-medium">Standard Operations</span>
                        <span className="text-sm font-mono font-bold">{overview.dailyBusinessPercent}%</span>
                      </div>
                    </div>
                    
                    {/* Topics Section */}
                    <div className="sm:w-2/3 p-4">
                      <div className="text-sm font-semibold text-muted-foreground mb-3">Topic Allocations</div>
                      {overview.topics.length === 0 ? (
                        <div className="text-sm text-muted-foreground p-3 border border-dashed rounded-sm text-center bg-muted/10">
                          No topics allocated for this {view}.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {overview.topics.map((topic: { topicId: string; title: string; allocationPercent: number }) => (
                            <div key={topic.topicId} className="flex items-center justify-between p-3 rounded-sm border bg-background hover:border-primary/50 transition-colors">
                              <span className="text-sm font-medium truncate pr-4">{topic.title}</span>
                              <span className="text-sm font-mono font-bold whitespace-nowrap">{topic.allocationPercent}%</span>
                            </div>
                          ))}
                          {overview.topics.length > 0 && (
                            <div className="flex justify-end pt-2 px-1">
                              <div className="text-xs font-mono text-muted-foreground">
                                {view === "month" ? "Average topic allocation" : "Topic Total"}: <span className="font-bold text-foreground">{overview.topicAllocationPercent}%</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Progress Bar visualization */}
                  <div className="h-2 w-full bg-muted flex">
                    <div 
                      className="bg-slate-400 h-full transition-all" 
                      style={{ width: `${Math.min(100, overview.dailyBusinessPercent)}%` }}
                      title={`BAU: ${overview.dailyBusinessPercent}%`}
                    />
                    <div 
                      className={`h-full transition-all ${isOver ? 'bg-destructive' : 'bg-primary'}`} 
                      style={{ width: `${Math.min(100 - overview.dailyBusinessPercent, overview.topicAllocationPercent)}%` }}
                      title={`Topics: ${overview.topicAllocationPercent}%`}
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
