import * as React from "react"
import { 
  useGetTopic, 
  useUpdateTopic, 
  useValidateTopic, 
  useValidateTopicBreakGlass,
  useAssignTopic,
  useAddTopicCollaborator,
  useAddTopicMilestone,
  useUpdateMilestone,
  useListMembers,
  getGetTopicQueryKey,
  getListTopicsQueryKey,
  getGetValidationQueueQueryKey
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { useParams } from "wouter"
import { format } from "date-fns"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input, Textarea } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge, PriorityBadge } from "@/components/badges"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

import { Activity, Calendar, CheckCircle2, FileText, FileWarning, HelpCircle, AlertTriangle, ShieldCheck, ShieldAlert, UserPlus, Users, Plus, Target, Check } from "lucide-react"

export function TopicDetail() {
  const { topicId } = useParams()
  const queryClient = useQueryClient()
  const { data: topic, isLoading } = useGetTopic(topicId!)
  const { data: members } = useListMembers()

  const assignTopic = useAssignTopic()
  const addMilestone = useAddTopicMilestone()
  const updateMilestone = useUpdateMilestone()
  const validateTopic = useValidateTopic()
  const validateBreakGlass = useValidateTopicBreakGlass()
  const updateTopic = useUpdateTopic()

  const [milestoneOpen, setMilestoneOpen] = React.useState(false)
  const [validationOpen, setValidationOpen] = React.useState(false)
  const [breakGlassOpen, setBreakGlassOpen] = React.useState(false)

  const milestoneForm = useForm({
    resolver: zodResolver(z.object({
      title: z.string().min(2).max(160),
      description: z.string().optional(),
      targetDate: z.string().optional(),
      assigneeId: z.string().optional()
    }))
  })

  const validationForm = useForm({
    resolver: zodResolver(z.object({ note: z.string().optional() }))
  })

  const breakGlassForm = useForm({
    resolver: zodResolver(z.object({ reason: z.string().min(20).max(2000), notifyResponsible: z.boolean().default(true) }))
  })

  const invalidateData = () => {
    queryClient.invalidateQueries({ queryKey: getGetTopicQueryKey(topicId!) })
    queryClient.invalidateQueries({ queryKey: getListTopicsQueryKey() })
    queryClient.invalidateQueries({ queryKey: getGetValidationQueueQueryKey() })
  }

  const onAssign = (memberId: string) => {
    assignTopic.mutate({ topicId: topicId!, data: { memberId } }, { onSuccess: invalidateData })
  }

  const onStatusChange = (status: any) => {
    updateTopic.mutate({ topicId: topicId!, data: { status } }, { onSuccess: invalidateData })
  }

  const onAddMilestone = (data: any) => {
    addMilestone.mutate({ topicId: topicId!, data }, {
      onSuccess: () => {
        setMilestoneOpen(false)
        milestoneForm.reset()
        invalidateData()
      }
    })
  }

  const onUpdateMilestone = (milestoneId: string, status: any) => {
    updateMilestone.mutate({ milestoneId, data: { status } }, { onSuccess: invalidateData })
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
          {/* Actions depending on status */}
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
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column (Description & Milestones) */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-4 border-b border-border/50">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" /> Topic Description
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap">{topic.description}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/50">
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" /> Milestones ({topic.completedMilestoneCount || 0}/{topic.milestoneCount || 0})
              </CardTitle>
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
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger></FormControl>
                                <SelectContent>
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
                           <Button size="sm" variant="outline" className="h-8" onClick={() => onUpdateMilestone(m.id, 'completed')}>
                             <Check className="h-4 w-4 mr-1" /> Mark Done
                           </Button>
                         )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column (Assignments & Activity) */}
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
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" /> Activity Log
              </CardTitle>
            </CardHeader>
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
        </div>
      </div>
    </div>
  )
}
