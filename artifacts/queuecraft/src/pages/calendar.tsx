import * as React from "react"
import { addMonths, eachDayOfInterval, endOfMonth, format, isSameMonth, startOfMonth, startOfWeek, endOfWeek } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Link } from "wouter"
import { useListTopics } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PriorityBadge, StatusBadge } from "@/components/badges"

export function Calendar() {
  const [month, setMonth] = React.useState(() => startOfMonth(new Date()))
  const { data: topics, isLoading } = useListTopics({ limit: 100 })
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  })

  return (
    <div className="flex-1 space-y-6 p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Planning calendar</p>
          <h1 className="text-3xl font-bold tracking-tight">Topic Calendar</h1>
          <p className="mt-1 text-muted-foreground">Topics appear on their estimated finish date, or committed finish date when no estimate is set.</p>
        </div>
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-1">
          <Button variant="ghost" size="icon" onClick={() => setMonth((value) => addMonths(value, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="w-40 text-center text-sm font-semibold">{format(month, "MMMM yyyy")}</div>
          <Button variant="ghost" size="icon" onClick={() => setMonth((value) => addMonths(value, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} className="p-3 text-center text-xs font-mono font-semibold uppercase text-muted-foreground">{day}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd")
              const dayTopics = (topics ?? []).filter((topic) => (topic.estimatedFinishDate ?? topic.targetDate)?.slice(0, 10) === key)
              return (
                <div key={key} className={`min-h-32 border-b border-r p-2 ${isSameMonth(day, month) ? "bg-background" : "bg-muted/20 text-muted-foreground"}`}>
                  <div className="mb-2 text-xs font-mono">{format(day, "d")}</div>
                  <div className="space-y-1">
                    {dayTopics.slice(0, 3).map((topic) => (
                      <Link key={topic.id} href={`/topics/${topic.id}`} className="block rounded-sm border bg-muted/30 p-1.5 text-xs hover:border-primary">
                        <div className="flex items-center gap-1"><PriorityBadge priority={topic.priority} /><span className="truncate font-medium">{topic.title}</span></div>
                        <div className="mt-1"><StatusBadge status={topic.status} /></div>
                      </Link>
                    ))}
                    {dayTopics.length > 3 && <div className="px-1 text-xs text-muted-foreground">+{dayTopics.length - 3} more</div>}
                  </div>
                </div>
              )
            })}
          </div>
          {!isLoading && (topics ?? []).every((topic) => !topic.estimatedFinishDate && !topic.targetDate) && (
            <div className="p-8 text-center text-sm text-muted-foreground">No topics have an estimated or committed finish date yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}