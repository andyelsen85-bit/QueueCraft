import { useGetDashboardSummary, useGetDashboardActivity } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Activity, AlertTriangle, CheckCircle2, Clock, FolderKanban, ShieldAlert, ShieldCheck } from "lucide-react"
import { StatusBadge } from "@/components/badges"
import { format } from "date-fns"

export function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary()
  const { data: activity, isLoading: loadingActivity } = useGetDashboardActivity({ limit: 10 })

  return (
    <div className="flex-1 space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Operations Dashboard</h1>
          <p className="text-muted-foreground mt-1">Real-time overview of topic lifecycle and routing.</p>
        </div>
      </div>

      {loadingSummary ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Active Topics</CardTitle>
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{summary.kpis.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-yellow-600 dark:text-yellow-500">Pending Validation</CardTitle>
              <ShieldAlert className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-500">{summary.kpis.pendingValidation}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{summary.kpis.inProgress}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-destructive">Unassigned</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive">{summary.kpis.unassigned}</div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingActivity ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : activity && activity.length > 0 ? (
              <div className="space-y-6">
                {activity.map((act) => (
                  <div key={act.id} className="flex items-start gap-4">
                    <div className="mt-0.5 rounded-sm bg-muted p-1">
                      {act.isBreakGlass ? (
                        <ShieldAlert className="h-4 w-4 text-destructive" />
                      ) : (
                        <Activity className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm">
                        <span className="font-semibold text-foreground">{act.actor.name}</span>{' '}
                        {act.action}
                      </p>
                      {act.detail && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{act.detail}</p>
                      )}
                      <p className="text-xs text-muted-foreground font-mono">
                        {format(new Date(act.createdAt), 'MMM d, HH:mm')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No recent activity.
              </div>
            )}
          </CardContent>
        </Card>

        {summary && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Priority Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {summary.priorityCounts.map((pc) => (
                    <div key={pc.label} className="flex items-center justify-between">
                      <span className="text-sm font-medium font-mono">P{pc.label}</span>
                      <span className="text-sm text-muted-foreground">{pc.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Status Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {summary.statusCounts.map((sc) => (
                    <div key={sc.label} className="flex items-center justify-between">
                      <StatusBadge status={sc.label} />
                      <span className="text-sm text-muted-foreground">{sc.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
