import * as React from "react"
import { Link, useLocation } from "wouter"
import { cn } from "@/lib/utils"
import { Home, FolderKanban, ListTodo, ShieldAlert, Users, CalendarDays, Settings, ChevronRight } from "lucide-react"
import { useGetSession } from "@workspace/api-client-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  const { data: session } = useGetSession()

  const navItems = [
    { label: "Dashboard", href: "/", icon: Home },
    { label: "My Work", href: "/my-work", icon: FolderKanban },
    { label: "Topics", href: "/topics", icon: ListTodo },
    { label: "Occupancy", href: "/occupancy", icon: CalendarDays },
    { label: "Calendar", href: "/calendar", icon: CalendarDays },
    { label: "Validation", href: "/validation", icon: ShieldAlert },
    { label: "Directory", href: "/directory", icon: Users },
    { label: "Settings", href: "/settings", icon: Settings },
  ]

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      {/* Sidebar */}
      <div className="hidden h-full w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          <div className="flex items-center gap-2 font-bold tracking-tight">
            <div className="h-6 w-6 rounded-sm bg-primary flex items-center justify-center text-primary-foreground">
              <span className="font-mono text-xs font-bold leading-none">QC</span>
            </div>
            QueueCraft
          </div>
        </div>
        
        <div className="flex-1 overflow-auto py-4">
          <nav className="space-y-1 px-2">
            {navItems.map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                    isActive 
                      ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                  {isActive && <ChevronRight className="ml-auto h-4 w-4 opacity-50" />}
                </Link>
              )
            })}
          </nav>
        </div>

        {session?.user && (
          <div className="border-t border-sidebar-border p-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9 bg-sidebar-accent">
                <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground border-sidebar-border border">
                  {session.user.initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-medium truncate">{session.user.name}</span>
                <span className="text-xs text-sidebar-foreground/60 truncate">{session.user.title || 'Member'}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="flex h-14 items-center border-b bg-background px-4 md:hidden">
          <div className="flex items-center gap-2 font-bold tracking-tight">
            <div className="h-6 w-6 rounded-sm bg-primary flex items-center justify-center text-primary-foreground">
              <span className="font-mono text-xs font-bold leading-none">QC</span>
            </div>
            QueueCraft
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
