import * as React from "react"

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending_validation: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    open: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    in_progress: "bg-primary/10 text-primary border-primary/20",
    completed: "bg-green-500/10 text-green-600 border-green-500/20",
    closed: "bg-muted text-muted-foreground border-border",
    returned: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    rejected: "bg-destructive/10 text-destructive border-destructive/20",
    not_started: "bg-muted text-muted-foreground border-border",
    blocked: "bg-destructive/10 text-destructive border-destructive/20",
  }

  const label = status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

  return (
    <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium uppercase tracking-wider font-mono ${colors[status] || colors.closed}`}>
      {label}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    P1: "bg-destructive text-destructive-foreground border-transparent",
    P2: "bg-orange-500 text-white border-transparent",
    P3: "bg-blue-500 text-white border-transparent",
    P4: "bg-muted text-muted-foreground border-border",
  }

  return (
    <span className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-xs font-bold font-mono ${colors[priority] || colors.P4}`}>
      {priority}
    </span>
  )
}
