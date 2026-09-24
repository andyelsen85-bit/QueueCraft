import { Route, Switch, useLocation } from "wouter"
import { AppLayout } from "./components/layout"
import { useGetSession } from "@workspace/api-client-react"
import { Loader2 } from "lucide-react"
import { Dashboard } from "./pages/dashboard"
import { MyWork } from "./pages/my-work"
import { Topics } from "./pages/topics"
import { TopicDetail } from "./pages/topic-detail"
import { Validation } from "./pages/validation"
import { Directory } from "./pages/directory"
import { Occupancy } from "./pages/occupancy"
import { Calendar } from "./pages/calendar"
import { SettingsPage } from "./pages/settings"
import NotFound from "./pages/not-found"
import { LoginPage } from "./pages/login"

export function AppRouter() {
  const [location] = useLocation()
  const { data: session, isLoading, error } = useGetSession()

  if (location === "/login") return <LoginPage />

  if (isLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error && ((error as any).status === 401 || (error as any).response?.status === 401)) {
    return <LoginPage />
  }
  if (error) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold tracking-tight text-destructive">Connection Error</h2>
          <p className="text-muted-foreground">Unable to connect to QueueCraft API.</p>
        </div>
      </div>
    )
  }

  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/my-work" component={MyWork} />
        <Route path="/topics" component={Topics} />
        <Route path="/topics/:topicId" component={TopicDetail} />
        <Route path="/validation" component={Validation} />
        <Route path="/directory">{session?.capabilities?.includes("directory.manage") ? <Directory /> : <AccessDenied />}</Route>
        <Route path="/occupancy" component={Occupancy} />
        <Route path="/calendar" component={Calendar} />
        <Route path="/settings">{session?.capabilities?.includes("settings.manage") ? <SettingsPage /> : <AccessDenied />}</Route>
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  )
}

function AccessDenied() {
  return <div className="p-8"><h1 className="text-2xl font-semibold">Access denied</h1><p className="mt-2 text-muted-foreground">You do not have permission to open this page.</p></div>
}
