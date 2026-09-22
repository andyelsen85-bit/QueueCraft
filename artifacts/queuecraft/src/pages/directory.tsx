import { useListDepartments, useListRoles, useListMembers } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

export function Directory() {
  const { data: departments, isLoading: ld } = useListDepartments()
  const { data: roles, isLoading: lr } = useListRoles()
  const { data: members, isLoading: lm } = useListMembers()

  const loading = ld || lr || lm

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Organization Directory</h1>
        <p className="text-muted-foreground mt-1">Departments, roles, and routing authorities.</p>
      </div>

      <TabsRoot defaultValue="departments">
        <TabsList className="w-full justify-start border-b border-border bg-transparent rounded-none p-0 h-auto mb-6">
          <TabsTrigger value="departments" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">
            Departments & Service Heads
          </TabsTrigger>
          <TabsTrigger value="roles" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">
            Roles & Leads
          </TabsTrigger>
          <TabsTrigger value="members" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">
            All Members
          </TabsTrigger>
        </TabsList>

        <TabsContent value="departments" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {departments?.map(dept => (
              <Card key={dept.id} className="h-full">
                <CardHeader>
                  <CardTitle className="text-lg">{dept.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 font-mono">Service Head</div>
                    <div className="flex items-center gap-3 bg-muted/50 p-2 rounded-sm border">
                      <Avatar className="h-8 w-8 bg-primary text-primary-foreground">
                        <AvatarFallback>{dept.serviceHead.initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{dept.serviceHead.name}</span>
                        <span className="text-xs text-muted-foreground">{dept.serviceHead.email}</span>
                      </div>
                    </div>
                  </div>
                  
                  {dept.serviceHeadDeputy && (
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 font-mono">Deputy</div>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>{dept.serviceHeadDeputy.initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{dept.serviceHeadDeputy.name}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
           <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {roles?.map(role => {
              const dept = departments?.find(d => d.id === role.departmentId)
              return (
                <Card key={role.id}>
                  <CardHeader className="pb-3">
                    <div className="text-xs font-mono text-muted-foreground mb-1">{dept?.name}</div>
                    <CardTitle className="text-lg">{role.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-0">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 font-mono">Role Lead</div>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 bg-secondary text-secondary-foreground">
                          <AvatarFallback>{role.lead.initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{role.lead.name}</span>
                        </div>
                      </div>
                    </div>
                    {role.deputy && (
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 font-mono">Deputy</div>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>{role.deputy.initials}</AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{role.deputy.name}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <div className="divide-y divide-border">
              {members?.map(member => (
                <div key={member.id} className="flex items-center p-4 hover:bg-muted/50 transition-colors">
                  <Avatar className="h-10 w-10 mr-4">
                    <AvatarFallback className="bg-muted text-foreground border">{member.initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col flex-1">
                    <span className="font-semibold">{member.name}</span>
                    <span className="text-sm text-muted-foreground">{member.title || 'Member'}</span>
                  </div>
                  <div className="text-sm text-muted-foreground font-mono">
                    {member.email}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </TabsRoot>
    </div>
  )
}
