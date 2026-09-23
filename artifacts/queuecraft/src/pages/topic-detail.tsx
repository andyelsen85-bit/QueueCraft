import * as React from "react"
import { 
  useGetTopic, 
  useUpdateTopic, 
  useUpdateTopicFinishDate,
  useValidateTopic, 
  useValidateTopicBreakGlass,
  useAssignTopic,
  useAddTopicCollaborator,
  useAddTopicMilestone,
  useUpdateMilestone,
  useDeleteMilestone,
  useListMembers,
  useGetTopicAllocations,
  useReplaceTopicAllocations,
  getGetTopicQueryKey,
  getListTopicsQueryKey,
  getGetValidationQueueQueryKey,
  getGetTopicAllocationsQueryKey,
  getGetOccupancyOverviewQueryKey,
  getGetMyWorkQueryKey
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { useParams } from "wouter"
import { format, startOfWeek, addWeeks, subWeeks } from "date-fns"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input, Textarea } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge, PriorityBadge } from "@/components/badges"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from "@/components/ui/tabs"

import { Activity, Calendar, CheckCircle2, FileText, FileWarning, HelpCircle, AlertTriangle, ShieldCheck, ShieldAlert, UserPlus, Users, Plus, Target, Check, Pencil, Trash2, CalendarDays, History, MoreHorizontal, ChevronLeft, ChevronRight } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const dateInputValue = (value?: string | null) => value ? value.slice(0, 10) : ""

export function TopicDetail() {
  const { topicId } = useParams()
  const queryClient = useQueryClient()
  const { data: topic, isLoading } = useGetTopic(topicId!)
  const { data: members } = useListMembers()

  const assignTopic = useAssignTopic()
  const addMilestone = useAddTopicMilestone()
  const updateMilestone = useUpdateMilestone()
  const deleteMilestone = useDeleteMilestone()
  const validateTopic = useValidateTopic()
  const validateBreakGlass = useValidateTopicBreakGlass()
  const updateTopic = useUpdateTopic()
  const updateFinishDate = useUpdateTopicFinishDate()
  const addCollaborator = useAddTopicCollaborator()
  const replaceAllocations = useReplaceTopicAllocations()

  const [milestoneOpen, setMilestoneOpen] = React.useState(false)
  const [validationOpen, setValidationOpen] = React.useState(false)
  const [breakGlassOpen, setBreakGlassOpen] = React.useState(false)
  const [editTopicOpen, setEditTopicOpen] = React.useState(false)
  const [rescopeOpen, setRescopeOpen] = React.useState(false)
  const [addCollabOpen, setAddCollabOpen] = React.useState(false)

  const [editMilestone, setEditMilestone] = React.useState<{id: string, open: boolean} | null>(null)

  const [allocWeek, setAllocWeek] = React.useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const allocWeekStr = format(allocWeek, 'yyyy-MM-dd')
  const { data: allocations } = useGetTopicAllocations(topicId!, allocWeekStr, { query: { enabled: !!topicId, queryKey: getGetTopicAllocationsQueryKey(topicId!, allocWeekStr) } })

  const invalidateData = () => {
    queryClient.invalidateQueries({ queryKey: getGetTopicQueryKey(topicId!) })
    queryClient.invalidateQueries({ queryKey: getListTopicsQueryKey() })
    queryClient.invalidateQueries({ queryKey: getGetValidationQueueQueryKey() })
    queryClient.invalidateQueries({ queryKey: getGetTopicAllocationsQueryKey(topicId!, allocWeekStr) })
    queryClient.invalidateQueries({ queryKey: getGetOccupancyOverviewQueryKey({ weekStart: allocWeekStr }) })
    queryClient.invalidateQueries({ queryKey: getGetMyWorkQueryKey() })
  }

  // Edit Topic Form
  const editTopicForm = useForm({
    resolver: zodResolver(z.object({
      title: z.string().min(3).max(160),
      description: z.string().min(3).max(2000),
      priority: z.enum(['P1', 'P2', 'P3', 'P4']),
      estimatedStartDate: z.string().optional().nullable(),
      estimatedFinishDate: z.string().optional().nullable(),
      estimatedEffortHours: z.coerce.number().min(0).optional().nullable()
    }))
  })

  const validationForm = useForm({
    resolver: zodResolver(z.object({ note: z.string().optional() }))
  })

  const breakGlassForm = useForm({
    resolver: zodResolver(z.object({ reason: z.string().min(20).max(2000), notifyResponsible: z.boolean().default(true) }))
  })

  // Set default values when topic loads
  React.useEffect(() => {
    if (topic && editTopicOpen) {
      editTopicForm.reset({
        title: topic.title,
        description: topic.description,
        priority: topic.priority as any,
        estimatedStartDate: dateInputValue(topic.estimatedStartDate),
        estimatedFinishDate: dateInputValue(topic.estimatedFinishDate),
        estimatedEffortHours: topic.estimatedEffortHours || 0
      })
    }
  }, [topic, editTopicOpen, editTopicForm])

  const onEditTopic = (data: any) => {
    updateTopic.mutate({ topicId: topicId!, data: { ...data, estimatedEffortHours: data.estimatedEffortHours || null, estimatedStartDate: data.estimatedStartDate || null, estimatedFinishDate: data.estimatedFinishDate || null } }, {
      onSuccess: () => {
        setEditTopicOpen(false)
        invalidateData()
      }
    })
  }

  // Rescope Finish Date
  const rescopeForm = useForm({
    resolver: zodResolver(z.object({
      targetDate: z.string().min(1),
      note: z.string().min(1, "A note is required explaining why the date is changing")
    }))
  })

  React.useEffect(() => {
    if (topic && rescopeOpen) {
      rescopeForm.reset({ targetDate: dateInputValue(topic.targetDate), note: "" })
    }
  }, [topic, rescopeOpen, rescopeForm])

  const onRescope = (data: any) => {
    updateFinishDate.mutate({ topicId: topicId!, data }, {
      onSuccess: () => {
        setRescopeOpen(false)
        invalidateData()
      }
    })
  }

  // Collaborator
  const collabForm = useForm({
    resolver: zodResolver(z.object({
      memberId: z.string().min(1)
    }))
  })

  const onAddCollab = (data: any) => {
    addCollaborator.mutate({ topicId: topicId!, data: { memberId: data.memberId } }, {
      onSuccess: () => {
        setAddCollabOpen(false)
        collabForm.reset()
        invalidateData()
      }
    })
  }

  // Milestone forms
  const milestoneForm = useForm({
    resolver: zodResolver(z.object({
      title: z.string().min(2).max(160),
      description: z.string().optional(),
      targetDate: z.string().optional(),
      assigneeId: z.string().optional()
    }))
  })

  const editMilestoneForm = useForm({
    resolver: zodResolver(z.object({
      title: z.string().min(2).max(160),
      description: z.string().optional(),
      targetDate: z.string().optional(),
      assigneeId: z.string().optional()
    }))
  })

  React.useEffect(() => {
    if (editMilestone?.open && editMilestone.id) {
      const m = topic?.milestones.find(x => x.id === editMilestone.id)
      if (m) {
        editMilestoneForm.reset({
          title: m.title,
          description: m.description || "",
          targetDate: dateInputValue(m.targetDate),
          assigneeId: m.assignee?.id || "none"
        })
      }
    }
  }, [editMilestone, topic, editMilestoneForm])

  const onAddMilestone = (data: any) => {
    addMilestone.mutate({ topicId: topicId!, data: { ...data, assigneeId: data.assigneeId === "none" ? null : data.assigneeId, targetDate: data.targetDate || null } }, {
      onSuccess: () => {
        setMilestoneOpen(false)
        milestoneForm.reset()
        invalidateData()
      }
    })
  }

  const onUpdateMilestoneForm = (data: any) => {
    if (!editMilestone?.id) return
    updateMilestone.mutate({ milestoneId: editMilestone.id, data: { ...data, assigneeId: data.assigneeId === "none" ? null : data.assigneeId, targetDate: data.targetDate || null } }, {
      onSuccess: () => {
        setEditMilestone(null)
        invalidateData()
      }
    })
  }

  const onUpdateMilestoneStatus = (milestoneId: string, status: any) => {
    updateMilestone.mutate({ milestoneId, data: { status } }, { onSuccess: invalidateData })
  }

  const onDeleteMilestone = (milestoneId: string) => {
    if (confirm("Are you sure you want to delete this milestone?")) {
      deleteMilestone.mutate({ milestoneId }, { onSuccess: invalidateData })
    }
  }

  // Standard interactions
  const onAssign = (memberId: string) => {
    assignTopic.mutate({ topicId: topicId!, data: { memberId } }, { onSuccess: invalidateData })
  }
  const onStatusChange = (status: any) => {
    updateTopic.mutate({ topicId: topicId!, data: { status } }, { onSuccess: invalidateData })
  }
  const onValidate = (data: any) => {
    validateTopic.mutate({ topicId: topicId!, data }, {
      onSuccess: () => {
        setValidationOpen(false)
        invalidateData()
      }
    })
  }
  const onBreakGlass = (data: any) => {
    validateBreakGlass.mutate({ topicId: topicId!, data }, {
      onSuccess: () => {
        setBreakGlassOpen(false)
        invalidateData()
      }
    })
  }

  // Allocations state
  const [allocState, setAllocState] = React.useState<Record<string, number>>({})

  React.useEffect(() => {
    if (allocations) {
      const st: Record<string, number> = {}
      allocations.forEach(a => st[a.member.id] = a.allocationPercent)
      setAllocState(st)
    } else {
      setAllocState({})
    }
  }, [allocations, allocWeekStr])

  const onSaveAllocations = () => {
    const data = Object.entries(allocState)
      .filter(([, allocationPercent]) => allocationPercent > 0)
      .map(([memberId, allocationPercent]) => ({
        memberId,
        allocationPercent
      }))
    replaceAllocations.mutate({ topicId: topicId!, data: { weekStart: allocWeekStr, allocations: data } }, {
      onSuccess: invalidateData
    })
  }

  if (isLoading || !topic) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid md:grid-cols-3 gap-6">
          <Skeleton className="md:col-span-2 h-[500px]" />
          <Skeleton className="h-[500px]" />
        </div>
      </div>
    )
  }

  const isPendingValidation = topic.status === 'pending_validation'

  const availableCollabs = members?.filter(m =>
    m.id !== topic.primaryAssignee?.id &&
    !(topic.collaborators || []).some(c => c.member.id === m.id)
  )

  const allocParticipants = [
    ...(topic.primaryAssignee ? [topic.primaryAssignee] : []),
    ...(topic.collaborators?.map(c => c.member) || [])
  ]

  return (
    <div className="flex-1 space-y-6 p-8">
      {/* Header Area */}
      <div className="flex flex-col lg:flex-row gap-6 justify-between items-start">
        <div className="space-y-3 flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <PriorityBadge priority={topic.priority} />
            <StatusBadge status={topic.status} />
            <span className="text-sm font-mono text-muted-foreground">{topic.id}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{topic.title}</h1>
          <div className="flex flex-wrap items-center gap-4 text-sm font-mono bg-muted/50 p-3 rounded-sm border inline-flex">
            <div><span className="text-muted-foreground">Dept:</span> <span className="font-semibold">{topic.department.name}</span></div>
            <div className="w-px h-4 bg-border" />
            <div><span className="text-muted-foreground">Role:</span> {topic.role.name}</div>
            <div className="w-px h-4 bg-border" />
            <div><span className="text-muted-foreground">Created by:</span> {topic.creator.name}</div>
            <div className="w-px h-4 bg-border" />
            <div><span className="text-muted-foreground">Date:</span> {format(new Date(topic.createdAt), 'MMM d, yyyy')}</div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
          {isPendingValidation ? (
            <>
              <Dialog open={validationOpen} onOpenChange={setValidationOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-yellow-600 hover:bg-yellow-700 text-white gap-2 w-full sm:w-auto">
                    <ShieldCheck className="h-4 w-4" />
                    Standard Validate
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Validate Topic</DialogTitle>
                  </DialogHeader>
                  <Form {...validationForm}>
                    <form onSubmit={validationForm.handleSubmit(onValidate)} className="space-y-4">
                      <FormField control={validationForm.control} name="note" render={({field}) => (
                        <FormItem>
                          <FormLabel>Approval Note (Optional)</FormLabel>
                          <FormControl><Textarea {...field} /></FormControl>
                        </FormItem>
                      )} />
                      <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setValidationOpen(false)}>Cancel</Button>
                        <Button type="submit" className="bg-yellow-600 hover:bg-yellow-700 text-white">Approve Routing</Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>

              <Dialog open={breakGlassOpen} onOpenChange={setBreakGlassOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive" className="gap-2 w-full sm:w-auto">
                    <AlertTriangle className="h-4 w-4" />
                    Break Glass
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="text-destructive flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5" /> Break Glass Validation
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground">Bypass standard Service Head approval. This action is heavily audited.</p>
                  </DialogHeader>
                  <Form {...breakGlassForm}>
                    <form onSubmit={breakGlassForm.handleSubmit(onBreakGlass)} className="space-y-4">
                      <FormField control={breakGlassForm.control} name="reason" render={({field}) => (
                        <FormItem>
                          <FormLabel>Justification (Required, min 20 chars)</FormLabel>
                          <FormControl><Textarea {...field} className="min-h-[100px]" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setBreakGlassOpen(false)}>Cancel</Button>
                        <Button type="submit" variant="destructive">Execute Break Glass</Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </>
          ) : (
            <div className="flex gap-2 w-full">
              <Select value={topic.status} onValueChange={onStatusChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <Dialog open={editTopicOpen} onOpenChange={setEditTopicOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" title="Edit Topic"><Pencil className="h-4 w-4" /></Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Edit Topic</DialogTitle>
              </DialogHeader>
              <Form {...editTopicForm}>
                <form onSubmit={editTopicForm.handleSubmit(onEditTopic)} className="space-y-4">
                  <FormField control={editTopicForm.control} name="title" render={({field}) => (
                    <FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>
                  )} />
                  <FormField control={editTopicForm.control} name="description" render={({field}) => (
                    <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} className="min-h-[150px]"/></FormControl><FormMessage/></FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={editTopicForm.control} name="priority" render={({field}) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="P1">P1</SelectItem>
                            <SelectItem value="P2">P2</SelectItem>
                            <SelectItem value="P3">P3</SelectItem>
                            <SelectItem value="P4">P4</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={editTopicForm.control} name="estimatedEffortHours" render={({field}) => (
                      <FormItem><FormLabel>Estimated Hours</FormLabel><FormControl><Input type="number" {...field} value={field.value || ""}/></FormControl><FormMessage/></FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={editTopicForm.control} name="estimatedStartDate" render={({field}) => (
                      <FormItem><FormLabel>Est. Start Date</FormLabel><FormControl><Input type="date" {...field} value={field.value || ""}/></FormControl><FormMessage/></FormItem>
                    )} />
                    <FormField control={editTopicForm.control} name="estimatedFinishDate" render={({field}) => (
                      <FormItem><FormLabel>Est. Finish Date</FormLabel><FormControl><Input type="date" {...field} value={field.value || ""}/></FormControl><FormMessage/></FormItem>
                    )} />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setEditTopicOpen(false)}>Cancel</Button>
                    <Button type="submit">Save Changes</Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-4 border-b border-border/50">
              <CardTitle className="text-lg flex items-center justify-between">
                <div className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Topic Description</div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap">{topic.description}</p>
              </div>
              <div className="mt-6 flex flex-wrap gap-6 text-sm">
                {topic.estimatedStartDate && (
                  <div><span className="text-muted-foreground block text-xs uppercase mb-1 font-semibold">Est. Start</span>{format(new Date(topic.estimatedStartDate), 'yyyy-MM-dd')}</div>
                )}
                {topic.estimatedFinishDate && (
                  <div><span className="text-muted-foreground block text-xs uppercase mb-1 font-semibold">Est. Finish</span>{format(new Date(topic.estimatedFinishDate), 'yyyy-MM-dd')}</div>
                )}
                {topic.estimatedEffortHours != null && (
                  <div><span className="text-muted-foreground block text-xs uppercase mb-1 font-semibold">Effort</span>{topic.estimatedEffortHours} hrs</div>
                )}
              </div>
            </CardContent>
          </Card>

          <TabsRoot defaultValue="milestones">
            <TabsList className="w-full justify-start border-b border-border bg-transparent rounded-none p-0 h-auto mb-4">
              <TabsTrigger value="milestones" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"><Target className="mr-2 h-4 w-4" />Milestones ({topic.completedMilestoneCount || 0}/{topic.milestoneCount || 0})</TabsTrigger>
              <TabsTrigger value="allocations" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"><CalendarDays className="mr-2 h-4 w-4" />Allocations</TabsTrigger>
              <TabsTrigger value="activity" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"><Activity className="mr-2 h-4 w-4" />Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="milestones">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/50">
                  <CardTitle className="text-lg">Tracked Deliverables</CardTitle>
                  {!isPendingValidation && (
                    <Dialog open={milestoneOpen} onOpenChange={setMilestoneOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-2">
                          <Plus className="h-4 w-4" /> Add Milestone
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>New Milestone</DialogTitle>
                        </DialogHeader>
                        <Form {...milestoneForm}>
                          <form onSubmit={milestoneForm.handleSubmit(onAddMilestone)} className="space-y-4">
                            <FormField control={milestoneForm.control} name="title" render={({field}) => (
                              <FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                            )} />
                            <FormField control={milestoneForm.control} name="description" render={({field}) => (
                              <FormItem><FormLabel>Description (Optional)</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>
                            )} />
                            <div className="grid grid-cols-2 gap-4">
                               <FormField control={milestoneForm.control} name="targetDate" render={({field}) => (
                                <FormItem><FormLabel>Target Date (Optional)</FormLabel><FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl></FormItem>
                              )} />
                              <FormField control={milestoneForm.control} name="assigneeId" render={({field}) => (
                                <FormItem>
                                  <FormLabel>Assignee (Optional)</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || "none"}>
                                    <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                                    <SelectContent>
                                      <SelectItem value="none">Unassigned</SelectItem>
                                      {members?.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </FormItem>
                              )} />
                            </div>
                            <div className="flex justify-end gap-2 pt-4">
                              <Button type="button" variant="outline" onClick={() => setMilestoneOpen(false)}>Cancel</Button>
                              <Button type="submit">Add Milestone</Button>
                            </div>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  {topic.milestones.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                      No milestones tracked for this topic.
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {topic.milestones.map(m => (
                        <div key={m.id} className="p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center hover:bg-muted/30 transition-colors">
                          <div className="flex-1">
                            <div className="font-semibold">{m.title}</div>
                            {m.description && <div className="text-sm text-muted-foreground mt-1">{m.description}</div>}
                            <div className="flex gap-4 mt-2 text-xs font-mono text-muted-foreground">
                              {m.targetDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {format(new Date(m.targetDate), 'MMM d, yyyy')}</span>}
                              {m.assignee && <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {m.assignee.name}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                             <StatusBadge status={m.status} />
                             {!isPendingValidation && m.status !== 'completed' && (
                               <Button size="sm" variant="outline" className="h-8" onClick={() => onUpdateMilestoneStatus(m.id, 'completed')}>
                                 <Check className="h-4 w-4 mr-1" /> Mark Done
                               </Button>
                             )}
                             {!isPendingValidation && (
                               <DropdownMenu>
                                 <DropdownMenuTrigger asChild>
                                   <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4"/></Button>
                                 </DropdownMenuTrigger>
                                 <DropdownMenuContent align="end">
                                   <DropdownMenuItem onClick={() => setEditMilestone({id: m.id, open: true})}><Pencil className="mr-2 h-4 w-4"/>Edit Milestone</DropdownMenuItem>
                                   <DropdownMenuItem onClick={() => onDeleteMilestone(m.id)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4"/>Delete</DropdownMenuItem>
                                 </DropdownMenuContent>
                               </DropdownMenu>
                             )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Dialog open={editMilestone?.open} onOpenChange={(open) => setEditMilestone(prev => prev ? {...prev, open} : null)}>
                <DialogContent>
                  <DialogHeader><DialogTitle>Edit Milestone</DialogTitle></DialogHeader>
                  <Form {...editMilestoneForm}>
                    <form onSubmit={editMilestoneForm.handleSubmit(onUpdateMilestoneForm)} className="space-y-4">
                      <FormField control={editMilestoneForm.control} name="title" render={({field}) => (
                        <FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                      )} />
                      <FormField control={editMilestoneForm.control} name="description" render={({field}) => (
                        <FormItem><FormLabel>Description (Optional)</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>
                      )} />
                      <div className="grid grid-cols-2 gap-4">
                         <FormField control={editMilestoneForm.control} name="targetDate" render={({field}) => (
                          <FormItem><FormLabel>Target Date (Optional)</FormLabel><FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl></FormItem>
                        )} />
                        <FormField control={editMilestoneForm.control} name="assigneeId" render={({field}) => (
                          <FormItem>
                            <FormLabel>Assignee (Optional)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || "none"}>
                              <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="none">Unassigned</SelectItem>
                                {members?.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />
                      </div>
                      <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setEditMilestone(null)}>Cancel</Button>
                        <Button type="submit">Save</Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </TabsContent>

            <TabsContent value="allocations">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/50">
                  <CardTitle className="text-lg">Weekly Allocation Planning</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setAllocWeek(prev => subWeeks(prev, 1))}><ChevronLeft className="h-4 w-4"/></Button>
                    <Input type="date" className="h-8 w-[140px]" value={allocWeekStr} onChange={(e) => {
                      if(e.target.value && !isNaN(new Date(e.target.value).getTime())) setAllocWeek(startOfWeek(new Date(e.target.value), { weekStartsOn: 1 }))
                    }} />
                    <Button variant="ghost" size="icon" onClick={() => setAllocWeek(prev => addWeeks(prev, 1))}><ChevronRight className="h-4 w-4"/></Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {allocParticipants.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                      Assign members or add collaborators to manage their weekly allocations.
                    </div>
                  ) : (
                    <div className="p-4 space-y-4">
                      {allocParticipants.map(member => (
                        <div key={member.id} className="flex items-center gap-4 border p-3 rounded-sm">
                          <Avatar className="h-8 w-8"><AvatarFallback>{member.initials}</AvatarFallback></Avatar>
                          <div className="flex-1">
                            <div className="font-semibold text-sm">{member.name}</div>
                            <div className="text-xs text-muted-foreground font-mono">BAU: {member.dailyBusinessPercent ?? 0}%</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="0" max="100"
                              className="w-[80px]"
                              value={allocState[member.id] ?? 0}
                              onChange={e => setAllocState({...allocState, [member.id]: Number(e.target.value)})}
                            />
                            <span className="text-muted-foreground text-sm">%</span>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-end pt-2">
                        <Button onClick={onSaveAllocations} disabled={replaceAllocations.isPending}>{replaceAllocations.isPending ? "Saving..." : "Save Allocations"}</Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity">
              <Card>
                <CardContent className="p-0">
                  <div className="h-[400px] overflow-auto p-6 space-y-6">
                    {topic.activity.length === 0 ? (
                      <div className="text-center text-sm text-muted-foreground">No activity recorded.</div>
                    ) : (
                      topic.activity.map(act => (
                        <div key={act.id} className="flex gap-4 relative">
                          <div className="absolute left-3 top-6 bottom-[-24px] w-px bg-border last:hidden" />
                          <div className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${act.isBreakGlass ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground'}`}>
                            {act.isBreakGlass ? <AlertTriangle className="h-3 w-3" /> : <Activity className="h-3 w-3" />}
                          </div>
                          <div className="flex-1 pb-4">
                            <div className="text-sm">
                              <span className="font-semibold">{act.actor.name}</span> {act.action}
                            </div>
                            {act.detail && (
                              <div className="text-sm text-muted-foreground mt-1 bg-muted/30 p-2 rounded-sm border">{act.detail}</div>
                            )}
                            <div className="text-xs font-mono text-muted-foreground mt-1">
                              {format(new Date(act.createdAt), 'MMM d, yyyy HH:mm')}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </TabsRoot>
        </div>

        {/* Right Column (Assignments & Rescoping) */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-4 border-b border-border/50">
              <CardTitle className="text-lg">Assignment</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div>
                <div className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wide">Primary Accountability</div>
                {topic.primaryAssignee ? (
                  <div className="flex items-center justify-between bg-muted/30 p-3 rounded-sm border">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8"><AvatarFallback className="bg-primary text-primary-foreground">{topic.primaryAssignee.initials}</AvatarFallback></Avatar>
                      <div className="flex flex-col"><span className="text-sm font-semibold">{topic.primaryAssignee.name}</span></div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-muted/30 p-3 rounded-sm border flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Unassigned</span>
                    <Select onValueChange={onAssign}>
                      <SelectTrigger className="w-[140px] h-8 bg-background">
                        <SelectValue placeholder="Assign To..." />
                      </SelectTrigger>
                      <SelectContent>
                        {members?.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wide">
                  <span>Collaborators</span>
                  {!isPendingValidation && (
                    <Dialog open={addCollabOpen} onOpenChange={setAddCollabOpen}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-5 px-2 text-xs"><Plus className="h-3 w-3 mr-1"/> Add</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Add Collaborator</DialogTitle></DialogHeader>
                        <Form {...collabForm}>
                          <form onSubmit={collabForm.handleSubmit(onAddCollab)} className="space-y-4">
                            <FormField control={collabForm.control} name="memberId" render={({field}) => (
                              <FormItem>
                                <FormLabel>Member</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl><SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger></FormControl>
                                  <SelectContent>
                                    {availableCollabs?.length === 0 && <SelectItem value="none" disabled>No available members</SelectItem>}
                                    {availableCollabs?.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )} />
                            <div className="flex justify-end gap-2 pt-4">
                              <Button type="button" variant="outline" onClick={() => setAddCollabOpen(false)}>Cancel</Button>
                              <Button type="submit">Add</Button>
                            </div>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
                <div className="space-y-2">
                  {topic.collaborators?.map(c => (
                    <div key={c.id} className="flex items-center gap-3 bg-muted/10 p-2 rounded-sm border">
                      <Avatar className="h-6 w-6"><AvatarFallback className="text-xs">{c.member.initials}</AvatarFallback></Avatar>
                      <span className="text-sm font-medium">{c.member.name}</span>
                    </div>
                  ))}
                  {(!topic.collaborators || topic.collaborators.length === 0) && (
                    <div className="text-sm text-muted-foreground italic p-2">None</div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wide">Validation details</div>
                {topic.validatedAt ? (
                  <div className={`p-3 rounded-sm border ${topic.validationMode === 'break_glass' ? 'bg-destructive/10 border-destructive/20' : 'bg-green-500/10 border-green-500/20'}`}>
                    <div className="flex items-center gap-2 text-sm font-semibold mb-1">
                      {topic.validationMode === 'break_glass' ? <ShieldAlert className="h-4 w-4 text-destructive" /> : <ShieldCheck className="h-4 w-4 text-green-600" />}
                      {topic.validationMode === 'break_glass' ? 'Break-Glass Validation' : 'Standard Validation'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      By {topic.validator?.name} on {format(new Date(topic.validatedAt), 'MMM d, HH:mm')}
                    </div>
                    {topic.validationReason && (
                      <div className="mt-2 text-xs italic opacity-80 border-t border-black/10 dark:border-white/10 pt-2">
                        "{topic.validationReason}"
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 rounded-sm border bg-yellow-500/10 border-yellow-500/20 text-sm">
                    Pending Service Head validation
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4 border-b border-border/50">
              <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Est. Finish</CardTitle>
                {false && !isPendingValidation && (
                    <Dialog open={rescopeOpen} onOpenChange={setRescopeOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm"><History className="h-4 w-4 mr-2"/> Re-scope</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Re-scope Finish Date</DialogTitle></DialogHeader>
                      <Form {...rescopeForm}>
                        <form onSubmit={rescopeForm.handleSubmit(onRescope)} className="space-y-4">
                          <FormField control={rescopeForm.control} name="targetDate" render={({field}) => (
                            <FormItem><FormLabel>New Target Date</FormLabel><FormControl><Input type="date" {...field} value={field.value || ""}/></FormControl><FormMessage/></FormItem>
                          )} />
                          <FormField control={rescopeForm.control} name="note" render={({field}) => (
                            <FormItem><FormLabel>Mandatory Note / Justification</FormLabel><FormControl><Textarea {...field} className="min-h-[100px]"/></FormControl><FormMessage/></FormItem>
                          )} />
                          <div className="flex justify-end gap-2 pt-4">
                            <Button type="button" variant="outline" onClick={() => setRescopeOpen(false)}>Cancel</Button>
                            <Button type="submit">Re-scope Topic</Button>
                          </div>
                        </form>
                      </Form>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {topic.estimatedFinishDate ? (
                <div className="text-2xl font-bold tracking-tight mb-6 text-primary">
                  {format(new Date(topic.estimatedFinishDate), 'MMM d, yyyy')}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground mb-6">No estimated finish date set.</div>
              )}

            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
