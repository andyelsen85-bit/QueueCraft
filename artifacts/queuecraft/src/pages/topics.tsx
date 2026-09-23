import * as React from "react"
import {
  useListTopics,
  useCreateTopic,
  useListDepartments,
  useListRoles,
  useGetTopicFilterPreferences,
  useUpdateTopicFilterPreferences,
} from "@workspace/api-client-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Textarea } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge, PriorityBadge } from "@/components/badges"
import { Link, useLocation } from "wouter"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { format } from "date-fns"
import { Search, Plus, SlidersHorizontal } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { getListTopicsQueryKey } from "@workspace/api-client-react"

const createSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().min(3).max(2000),
  departmentId: z.string().min(1),
  roleId: z.string().min(1),
  priority: z.enum(["P1", "P2", "P3", "P4"]),
  targetDate: z.string().optional().nullable(),
  estimatedStartDate: z.string().optional().nullable(),
  estimatedFinishDate: z.string().optional().nullable(),
  estimatedEffortHours: z.coerce.number().int().min(0).optional().nullable(),
}).refine(
  (data) => !data.estimatedStartDate || !data.estimatedFinishDate || data.estimatedStartDate <= data.estimatedFinishDate,
  { message: "Estimated finish must be on or after the start date", path: ["estimatedFinishDate"] },
)

type CreateFormValues = z.infer<typeof createSchema>

export function Topics() {
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState<string>("")
  const [priority, setPriority] = React.useState<string>("")
  const [departmentId, setDepartmentId] = React.useState<string>("")
  const [roleId, setRoleId] = React.useState<string>("")
  const [filtersReady, setFiltersReady] = React.useState(false)
  const [openCreate, setOpenCreate] = React.useState(false)
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()
  const { data: savedFilters, isLoading: filtersLoading, isError: filtersError } = useGetTopicFilterPreferences()
  const updateFilters = useUpdateTopicFilterPreferences()

  const normalizeFilter = (value: string) => (value === "none" ? "" : value)

  React.useEffect(() => {
    if (!savedFilters || filtersReady) return
    setDepartmentId(savedFilters.departmentId ?? "")
    setRoleId(savedFilters.roleId ?? "")
    setStatus(savedFilters.status ?? "")
    setPriority(savedFilters.priority ?? "")
    setFiltersReady(true)
  }, [savedFilters, filtersReady])

  const saveFilters = React.useCallback((next: {
    departmentId?: string
    roleId?: string
    status?: string
    priority?: string
  }) => {
    if (!filtersReady) return
    updateFilters.mutate({
      data: {
        departmentId: (next.departmentId ?? departmentId) || null,
        roleId: (next.roleId ?? roleId) || null,
        status: ((next.status ?? status) || null) as any,
        priority: ((next.priority ?? priority) || null) as any,
      },
    })
  }, [departmentId, roleId, priority, status, filtersReady, updateFilters])

  // Queries
  const { data: topics, isLoading } = useListTopics({
    search: search || undefined,
    status: status ? (status as any) : undefined,
    priority: priority ? (priority as any) : undefined,
    departmentId: departmentId || undefined,
    roleId: roleId || undefined,
  })
  
  const { data: departments } = useListDepartments()
  const { data: roles } = useListRoles()
  const filteredRoles = React.useMemo(
    () => (roles ?? []).filter((role) =>
      !departmentId ||
      role.departmentId === departmentId ||
      role.departmentIds?.includes(departmentId),
    ),
    [roles, departmentId],
  )

  const createTopic = useCreateTopic()

  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      title: "",
      description: "",
      departmentId: "",
      roleId: "",
      priority: "P3",
      targetDate: "",
      estimatedStartDate: "",
      estimatedFinishDate: "",
      estimatedEffortHours: null,
    }
  })

  const watchDept = form.watch("departmentId")
  React.useEffect(() => {
    if (!filtersReady || !roles) return
    if (roleId && !filteredRoles.some((role) => role.id === roleId)) {
      setRoleId("")
      saveFilters({ roleId: "" })
    }
  }, [filteredRoles, filtersReady, roleId, roles, saveFilters])

  const onSubmit = (data: CreateFormValues) => {
    createTopic.mutate({ data: {
      ...data,
      targetDate: data.targetDate || null,
      estimatedStartDate: data.estimatedStartDate || null,
      estimatedFinishDate: data.estimatedFinishDate || null,
      estimatedEffortHours: data.estimatedEffortHours ?? null,
    } }, {
      onSuccess: (newTopic) => {
        setOpenCreate(false)
        form.reset()
        queryClient.invalidateQueries({ queryKey: getListTopicsQueryKey() })
        setLocation(`/topics/${newTopic.id}`)
      }
    })
  }

  return (
    <div className="flex-1 space-y-6 p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Topics</h1>
          <p className="text-muted-foreground mt-1">Browse, filter, and create operational topics.</p>
        </div>

        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Topic
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Create New Topic</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter topic title..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="departmentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Department</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select dept" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {departments?.map(d => (
                              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="roleId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role Assignment</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={!watchDept}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {filteredRoles.map(r => (
                              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="P1">P1 - Critical</SelectItem>
                            <SelectItem value="P2">P2 - High</SelectItem>
                            <SelectItem value="P3">P3 - Medium</SelectItem>
                            <SelectItem value="P4">P4 - Low</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="targetDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target Date (Optional)</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="rounded-sm border bg-muted/20 p-4 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">Planning estimates</h3>
                    <p className="text-xs text-muted-foreground">Set the expected delivery window and effort. The committed finish date can later be re-scoped with a mandatory note.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <FormField
                      control={form.control}
                      name="estimatedStartDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estimated Start</FormLabel>
                          <FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="estimatedFinishDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estimated Finish</FormLabel>
                          <FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="estimatedEffortHours"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estimated Hours</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={field.value ?? ""}
                              onChange={(event) => field.onChange(event.target.value === "" ? null : event.target.value)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Detailed description of the requirement..." className="min-h-[120px]" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" type="button" onClick={() => setOpenCreate(false)}>Cancel</Button>
                  <Button type="submit" disabled={createTopic.isPending}>
                    {createTopic.isPending ? "Creating..." : "Create Topic"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 bg-muted/50 p-4 rounded-sm border border-border">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
           <Input
             placeholder="Search topics by title or description..."
            className="pl-9 bg-background"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={departmentId || "none"} onValueChange={(value) => {
            const next = normalizeFilter(value)
            setDepartmentId(next)
            setRoleId("")
            saveFilters({ departmentId: next })
          }}>
            <SelectTrigger className="w-[190px] bg-background">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">All Departments</SelectItem>
              {departments?.map((department) => (
                <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={roleId || "none"} onValueChange={(value) => {
            const next = normalizeFilter(value)
            setRoleId(next)
            if (!next) setRoleId("")
          }} disabled={!departmentId}>
            <SelectTrigger className="w-[170px] bg-background">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">All Roles</SelectItem>
              {filteredRoles.map((role) => (
                <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status || "none"} onValueChange={(value) => {
            const next = normalizeFilter(value)
            setStatus(next)
            saveFilters({ status: next })
          }}>
            <SelectTrigger className="w-[160px] bg-background">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">All Statuses</SelectItem>
              <SelectItem value="pending_validation">Pending Validation</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priority || "none"} onValueChange={(value) => {
            const next = normalizeFilter(value)
            setPriority(next)
            saveFilters({ priority: next })
          }}>
            <SelectTrigger className="w-[140px] bg-background">
              <SelectValue placeholder="All Priorities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">All Priorities</SelectItem>
              <SelectItem value="P1">P1</SelectItem>
              <SelectItem value="P2">P2</SelectItem>
              <SelectItem value="P3">P3</SelectItem>
              <SelectItem value="P4">P4</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        {filtersLoading ? "Loading your saved filters…" : filtersError ? "Filters could not be loaded; using defaults." : updateFilters.isPending ? "Saving filters…" : "Your department, role, status, and priority filters are saved automatically."}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : topics && topics.length > 0 ? (
        <div className="space-y-2">
          {topics.map((t) => (
            <Link key={t.id} href={`/topics/${t.id}`} className="block group">
              <Card className="transition-all hover:border-primary/50 hover:shadow-md">
                <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="w-12 flex-none font-mono text-xs text-muted-foreground font-semibold">
                    {t.id.slice(0, 8)}
                  </div>
                  <div className="w-10 flex-none text-center">
                    <PriorityBadge priority={t.priority} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold truncate group-hover:text-primary transition-colors">{t.title}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground font-mono">
                      <span className="font-medium text-foreground">{t.department.name}</span>
                      <span>/</span>
                      <span>{t.role.name}</span>
                      <span>•</span>
                      <span>Created {format(new Date(t.createdAt), 'MMM d, yyyy')}</span>
                    </div>
                  </div>
                  <div className="flex-none flex items-center gap-4">
                     <div className="hidden text-right text-xs sm:block">
                       <div className="font-mono uppercase text-muted-foreground">Est. finish</div>
                       <div className="font-semibold">{t.estimatedFinishDate ? format(new Date(t.estimatedFinishDate), "MMM d, yyyy") : "—"}</div>
                     </div>
                     <div className="hidden text-right text-xs sm:block">
                       <div className="font-mono uppercase text-muted-foreground">Committed finish</div>
                       <div className="font-semibold">{t.status === "closed" && t.targetDate ? format(new Date(t.targetDate), "MMM d, yyyy") : "—"}</div>
                     </div>
                    <StatusBadge status={t.status} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="py-16 text-center border-2 border-dashed border-muted rounded-sm">
          <h3 className="text-lg font-semibold mb-1">No topics found</h3>
          <p className="text-muted-foreground text-sm">Adjust your filters or create a new topic to get started.</p>
        </div>
      )}
    </div>
  )
}
