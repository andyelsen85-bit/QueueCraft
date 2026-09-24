import * as React from "react"
import { useGetValidationQueue, useValidateTopic } from "@workspace/api-client-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge, PriorityBadge } from "@/components/badges"
import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/dates"
import { Link } from "wouter"
import { ShieldCheck, ShieldAlert, FileText, ArrowRight } from "lucide-react"

export function Validation() {
  const { data: queue, isLoading } = useGetValidationQueue()

  return (
    <div className="flex-1 space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-yellow-600 dark:text-yellow-500">Validation Queue</h1>
          <p className="text-muted-foreground mt-1">Topics requiring Service Head authorization before routing.</p>
        </div>
        <div className="flex items-center justify-center h-12 w-12 rounded-full bg-yellow-500/10 text-yellow-600">
          <ShieldAlert className="h-6 w-6" />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : queue && queue.length > 0 ? (
        <div className="space-y-4">
          {[...queue]
            .sort((left, right) =>
              left.title.localeCompare(right.title, undefined, {
                numeric: true,
                sensitivity: "base",
              }),
            )
            .map(t => (
              <Card key={t.id} className="border-l-4 border-l-yellow-500">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <PriorityBadge priority={t.priority} />
                      <span className="font-mono text-xs text-muted-foreground">{t.id.slice(0,8)}</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">{t.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm font-mono bg-muted/50 p-2 rounded-sm inline-flex">
                      <div>
                        <span className="text-muted-foreground">Req Dept:</span> <span className="font-semibold">{t.department.name}</span>
                      </div>
                      <div className="w-px h-4 bg-border" />
                      <div>
                        <span className="text-muted-foreground">Creator:</span> {t.creator.name}
                      </div>
                      <div className="w-px h-4 bg-border" />
                      <div>
                         <span className="text-muted-foreground">Created:</span> {formatDate(t.createdAt)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-3 justify-center md:items-end min-w-[200px] md:border-l pl-6 border-border">
                    <div className="text-sm text-center md:text-right w-full mb-2">
                      <span className="block font-semibold text-foreground">Action Required</span>
                      <span className="block text-muted-foreground text-xs">Service Head Validation</span>
                    </div>
                    <Link href={`/topics/${t.id}`} className="w-full">
                      <Button className="w-full gap-2 bg-yellow-600 hover:bg-yellow-700 text-white">
                        <FileText className="h-4 w-4" />
                        Review Topic
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
            ))}
        </div>
      ) : (
        <div className="py-24 text-center border-2 border-dashed border-muted rounded-sm">
          <div className="mx-auto w-16 h-16 bg-green-500/10 text-green-500 flex items-center justify-center rounded-full mb-4">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Queue Clear</h3>
          <p className="text-muted-foreground">There are no topics waiting for your validation.</p>
        </div>
      )}
    </div>
  )
}
