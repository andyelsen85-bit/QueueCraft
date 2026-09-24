import { useGetMyWork } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from "@/components/ui/tabs"
import { StatusBadge, PriorityBadge } from "@/components/badges"
import { formatDate } from "@/lib/dates"
import { Link } from "wouter"
import { ArrowRight } from "lucide-react"

export function MyWork() {
  const { data: myWork, isLoading } = useGetMyWork()

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    )
  }

  if (!myWork) return null
  const openTopics = <T extends { status: string }>(topics: T[]) =>
    topics.filter((topic) => !["completed", "closed"].includes(topic.status))
  const assigned = openTopics(myWork.assigned)
  const created = openTopics(myWork.created)
  const collaborations = openTopics(myWork.collaborations)
  const milestones = myWork.milestones.filter((milestone) => milestone.status !== "completed")
  const compareName = (left: { title: string }, right: { title: string }) =>
    left.title.localeCompare(right.title, undefined, { numeric: true, sensitivity: "base" })
  const sortedAssigned = [...assigned].sort(compareName)
  const sortedCreated = [...created].sort(compareName)
  const sortedCollaborations = [...collaborations].sort(compareName)
  const sortedMilestones = [...milestones].sort(compareName)

  const TopicList = ({ topics, emptyMessage }: { topics: typeof myWork.created, emptyMessage: string }) => {
    if (topics.length === 0) {
      return (
        <div className="p-12 text-center text-sm text-muted-foreground border-2 border-dashed border-muted rounded-sm">
          {emptyMessage}
        </div>
      )
    }

    return (
      <div className="space-y-2">
        {topics.map(t => (
          <Link key={t.id} href={`/topics/${t.id}`} className="block group">
            <Card className="transition-colors hover:border-primary/50 hover:bg-muted/30">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 text-center">
                  <PriorityBadge priority={t.priority} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{t.title}</h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground font-mono">
                    <span>{t.department.name}</span>
                    <span>•</span>
                    <span>{t.role.name}</span>
                  </div>
                </div>
                <div className="flex-none">
                  <StatusBadge status={t.status} />
                </div>
                <div className="flex-none text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowRight className="h-4 w-4" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Work</h1>
        <p className="text-muted-foreground mt-1">Your responsibilities, created topics, and active assignments.</p>
      </div>

      <TabsRoot defaultValue="assigned">
        <TabsList className="w-full justify-start border-b border-border bg-transparent rounded-none p-0 h-auto">
          <TabsTrigger 
            value="assigned" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
          >
            Assigned Topics ({assigned.length})
          </TabsTrigger>
          <TabsTrigger 
            value="milestones" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
          >
            My Milestones ({milestones.length})
          </TabsTrigger>
          <TabsTrigger 
            value="created" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
          >
            Created by Me ({created.length})
          </TabsTrigger>
          <TabsTrigger 
            value="collaborating" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
          >
            Collaborating ({collaborations.length})
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="assigned">
            <TopicList topics={sortedAssigned} emptyMessage="No open topics currently assigned as primary responsibility." />
          </TabsContent>

          <TabsContent value="milestones">
            {milestones.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground border-2 border-dashed border-muted rounded-sm">
                No active milestones assigned to you.
              </div>
            ) : (
              <div className="space-y-2">
                {sortedMilestones.map(m => (
                  <Card key={m.id}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold truncate">{m.title}</h3>
                        {m.targetDate && (
                          <div className="text-xs text-muted-foreground mt-1 font-mono">
                            Target: {formatDate(m.targetDate)}
                          </div>
                        )}
                      </div>
                      <div className="flex-none">
                        <StatusBadge status={m.status} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="created">
            <TopicList topics={sortedCreated} emptyMessage="You haven't created any open topics." />
          </TabsContent>

          <TabsContent value="collaborating">
            <TopicList topics={sortedCollaborations} emptyMessage="You are not a collaborator on any open topics." />
          </TabsContent>
        </div>
      </TabsRoot>
    </div>
  )
}
