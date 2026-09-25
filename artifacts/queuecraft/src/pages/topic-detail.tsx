import * as React from "react";
import {
  useGetTopic,
  useGetSession,
  useDeleteTopic,
  useUpdateTopic,
  useUpdateTopicFinishDate,
  useValidateTopic,
  useValidateTopicBreakGlass,
  useAssignTopic,
  useAddTopicCollaborator,
  useDeleteTopicCollaborator,
  useAddTopicMilestone,
  useUpdateMilestone,
  useDeleteMilestone,
  useListMembers,
  useListDependencyCandidates,
  getListDependencyCandidatesQueryKey,
  getGetTopicQueryKey,
  getListTopicsQueryKey,
  getGetValidationQueueQueryKey,
  getGetOccupancyOverviewQueryKey,
  getGetMyWorkQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetDashboardActivityQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { startOfWeek, addWeeks, subWeeks } from "date-fns";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { formatDate, formatDateTime } from "@/lib/dates";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, PriorityBadge } from "@/components/badges";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  TabsContent,
  TabsList,
  TabsRoot,
  TabsTrigger,
} from "@/components/ui/tabs";

import {
  Activity,
  Calendar,
  CheckCircle2,
  FileText,
  ExternalLink,
  FileWarning,
  HelpCircle,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  UserPlus,
  Users,
  Plus,
  Target,
  Pencil,
  Trash2,
  History,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { occupancyStyle } from "@/lib/occupancy";
import { MilestoneAllocationFields } from "@/components/milestone-allocation-fields";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const dateInputValue = (value?: string | null) =>
  value ? value.slice(0, 10) : "";

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

const shiftedDate = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

function finishDecisionDate(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("status" in error) ||
    error.status !== 409 || !("data" in error)) return null;
  const data = error.data;
  if (!data || typeof data !== "object" || !("requiresFinishDecision" in data) ||
    data.requiresFinishDecision !== true || !("suggestedFinishDate" in data) ||
    typeof data.suggestedFinishDate !== "string") return null;
  return data.suggestedFinishDate;
}

const milestoneAllocationEntries = (values: Record<string, number>) => {
  if (Object.values(values).some((value) =>
    !Number.isInteger(value) || value < 0 || value > 100)) return null;
  return Object.entries(values)
    .filter(([, allocationPercent]) => allocationPercent > 0)
    .map(([memberId, allocationPercent]) => ({ memberId, allocationPercent }));
};

export function TopicDetail() {
  const { topicId } = useParams();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { data: topic, isLoading } = useGetTopic(topicId!);
  const { data: session } = useGetSession();
  const { data: members } = useListMembers();
  const { data: dependencyCandidates } = useListDependencyCandidates({ topicId: topicId! });
  const sortedMembers = React.useMemo(
    () =>
      [...(members ?? [])].sort((left, right) =>
        left.name.localeCompare(right.name, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      ),
    [members],
  );

  const assignTopic = useAssignTopic();
  const addMilestone = useAddTopicMilestone();
  const updateMilestone = useUpdateMilestone();
  const deleteMilestone = useDeleteMilestone();
  const validateTopic = useValidateTopic();
  const validateBreakGlass = useValidateTopicBreakGlass();
  const updateTopic = useUpdateTopic();
  const deleteTopic = useDeleteTopic();
  const updateFinishDate = useUpdateTopicFinishDate();
  const addCollaborator = useAddTopicCollaborator();
  const deleteCollaborator = useDeleteTopicCollaborator();

  const [milestoneOpen, setMilestoneOpen] = React.useState(false);
  const [validationOpen, setValidationOpen] = React.useState(false);
  const [breakGlassOpen, setBreakGlassOpen] = React.useState(false);
  const [editTopicOpen, setEditTopicOpen] = React.useState(false);
  const [editTopicError, setEditTopicError] = React.useState("");
  const [topicFinishChoice, setTopicFinishChoice] = React.useState<{
    data: any;
    suggestedFinishDate: string;
  } | null>(null);
  const [deleteError, setDeleteError] = React.useState("");
  const [assignmentError, setAssignmentError] = React.useState("");
  const [milestoneError, setMilestoneError] = React.useState("");
  const [finishChoice, setFinishChoice] = React.useState<{
    kind: "add" | "edit";
    milestoneId?: string;
    payload: any;
    suggestedFinishDate: string;
  } | null>(null);
  const [milestoneStatusError, setMilestoneStatusError] = React.useState("");
  const [milestoneAllocations, setMilestoneAllocations] = React.useState<Record<string, number>>({});
  const [editMilestoneAllocations, setEditMilestoneAllocations] = React.useState<Record<string, number>>({});
  const [rescopeOpen, setRescopeOpen] = React.useState(false);
  const [addCollabOpen, setAddCollabOpen] = React.useState(false);

  const [editMilestone, setEditMilestone] = React.useState<{
    id: string;
    open: boolean;
  } | null>(null);

  const invalidateData = () => {
    queryClient.invalidateQueries({ queryKey: getGetTopicQueryKey(topicId!) });
    queryClient.invalidateQueries({ queryKey: getListTopicsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListDependencyCandidatesQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getGetValidationQueueQueryKey(),
    });
    queryClient.invalidateQueries({
      queryKey: getGetOccupancyOverviewQueryKey(),
    });
    queryClient.invalidateQueries({ queryKey: getGetMyWorkQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
  };

  // Edit Topic Form
  const editTopicForm = useForm({
    resolver: zodResolver(
      z.object({
        title: z.string().min(3).max(160),
        description: z.string().min(3).max(2000),
        documentationUrl: z.string().max(2048).refine((value) => {
          if (!value.trim()) return true;
          try {
            const url = new URL(value.trim());
            return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
          } catch {
            return false;
          }
        }, "Enter a valid HTTP or HTTPS URL without credentials"),
        priority: z.enum(["P1", "P2", "P3", "P4"]),
        estimatedStartDate: z.string().optional().nullable(),
        estimatedFinishDate: z.string().optional().nullable(),
        dependsOnTopicId: z.string().optional().nullable(),
        estimatedEffortHours: z.coerce.number().min(0).optional().nullable(),
      }).refine((data) => !data.dependsOnTopicId || !data.estimatedFinishDate || Boolean(data.estimatedStartDate),
        { message: "Set an estimated start to preserve the planned duration", path: ["estimatedStartDate"] }),
    ),
  });

  const validationForm = useForm({
    resolver: zodResolver(z.object({ note: z.string().optional() })),
  });

  const breakGlassForm = useForm({
    resolver: zodResolver(
      z.object({
        reason: z.string().min(20).max(2000),
        notifyResponsible: z.boolean().default(true),
      }),
    ),
  });

  // Set default values when topic loads
  React.useEffect(() => {
    if (topic && editTopicOpen) {
      editTopicForm.reset({
        title: topic.title,
        description: topic.description,
        documentationUrl: topic.documentationUrl ?? "",
        priority: topic.priority as any,
        estimatedStartDate: dateInputValue(topic.estimatedStartDate),
        estimatedFinishDate: dateInputValue(topic.estimatedFinishDate),
        dependsOnTopicId: topic.dependency?.id ?? null,
        estimatedEffortHours: topic.estimatedEffortHours || 0,
      });
    }
  }, [topic, editTopicOpen, editTopicForm]);

  const selectedEditDependencyId = editTopicForm.watch("dependsOnTopicId");
  const existingEditDependency = topic?.dependency;
  const selectedEditDependency = dependencyCandidates?.find((entry) => entry.id === selectedEditDependencyId)
    ?? (existingEditDependency?.id === selectedEditDependencyId ? existingEditDependency : null);
  React.useEffect(() => {
    if (!editTopicOpen || !selectedEditDependency?.estimatedFinishDate) return;
    const anchor = dateInputValue(selectedEditDependency.estimatedFinishDate);
    const start = editTopicForm.getValues("estimatedStartDate");
    const finish = editTopicForm.getValues("estimatedFinishDate");
    if (start === anchor) return;
    const duration = start && finish ? daysBetween(start, finish) : null;
    editTopicForm.setValue("estimatedStartDate", anchor, { shouldValidate: true });
    if (duration !== null && duration >= 0) {
      editTopicForm.setValue("estimatedFinishDate", shiftedDate(anchor, duration), { shouldValidate: true });
    } else if (finish && finish < anchor) {
      editTopicForm.setValue("estimatedFinishDate", "", { shouldValidate: true });
    }
  }, [editTopicOpen, selectedEditDependency?.estimatedFinishDate, selectedEditDependencyId, editTopicForm]);

  const saveTopic = (data: any) => {
    setEditTopicError("");
    setTopicFinishChoice(null);
    updateTopic.mutate(
      {
        topicId: topicId!,
        data: {
          ...data,
          documentationUrl: data.documentationUrl?.trim() || null,
          estimatedEffortHours: data.estimatedEffortHours || null,
          estimatedStartDate: data.estimatedStartDate || null,
          estimatedFinishDate: data.estimatedFinishDate || null,
          dependsOnTopicId: data.dependsOnTopicId || null,
        },
      },
      {
        onSuccess: () => {
          setEditTopicOpen(false);
          invalidateData();
        },
        onError: (error) => setEditTopicError(error instanceof Error ? error.message : "Could not save topic."),
      },
    );
  };
  const onEditTopic = (data: any) => {
    const proposed = data.estimatedFinishDate;
    const previousStart = dateInputValue(topic?.estimatedStartDate);
    const newStart = data.estimatedStartDate;
    const movingPrerequisite = Boolean(topic && data.dependsOnTopicId &&
      data.dependsOnTopicId !== topic.dependency?.id && previousStart && newStart);
    const shift = movingPrerequisite ? daysBetween(previousStart, newStart) : 0;
    const latest = topic?.milestones.reduce<string | null>((end, milestone) => {
      const original = dateInputValue(milestone.targetDate);
      const target = original && shift ? shiftedDate(original, shift) : original;
      return target && (!end || target > end) ? target : end;
    }, null);
    if (topic && proposed && latest && latest > proposed &&
      proposed !== dateInputValue(topic.estimatedFinishDate)) {
      setTopicFinishChoice({ data, suggestedFinishDate: latest });
      return;
    }
    saveTopic(data);
  };

  // Rescope Finish Date
  const rescopeForm = useForm({
    resolver: zodResolver(
      z.object({
        targetDate: z.string().min(1),
        note: z
          .string()
          .min(1, "A note is required explaining why the date is changing"),
      }),
    ),
  });

  React.useEffect(() => {
    if (topic && rescopeOpen) {
      rescopeForm.reset({
        targetDate: dateInputValue(topic.targetDate),
        note: "",
      });
    }
  }, [topic, rescopeOpen, rescopeForm]);

  const onRescope = (data: any) => {
    updateFinishDate.mutate(
      { topicId: topicId!, data },
      {
        onSuccess: () => {
          setRescopeOpen(false);
          invalidateData();
        },
      },
    );
  };

  // Collaborator
  const collabForm = useForm({
    defaultValues: { memberId: "" },
    resolver: zodResolver(
      z.object({
        memberId: z.string().min(1),
      }),
    ),
  });

  const onAddCollab = (data: any) => {
    addCollaborator.mutate(
      { topicId: topicId!, data: { memberId: data.memberId } },
      {
        onSuccess: () => {
          setAddCollabOpen(false);
          collabForm.reset();
          invalidateData();
        },
      },
    );
  };

  // Milestone forms
  const milestoneForm = useForm({
    defaultValues: {
      title: "", description: "", beginDate: "", targetDate: "", assigneeId: "none",
      dependsOnMilestoneId: "none",
    },
    resolver: zodResolver(
      z.object({
        title: z.string().min(2).max(160),
        description: z.string().optional(),
        beginDate: z.string().min(1),
        targetDate: z.string().min(1),
        assigneeId: z.string().optional(),
        dependsOnMilestoneId: z.string().optional(),
      }),
    ),
  });

  const editMilestoneForm = useForm({
    defaultValues: {
      title: "", description: "", beginDate: "", targetDate: "", assigneeId: "none",
      dependsOnMilestoneId: "none",
    },
    resolver: zodResolver(
      z.object({
        title: z.string().min(2).max(160),
        description: z.string().optional(),
        beginDate: z.string().optional(),
        targetDate: z.string().optional(),
        assigneeId: z.string().optional(),
        dependsOnMilestoneId: z.string().optional(),
      }),
    ),
  });

  const selectedAddMilestoneDependency = topic?.milestones.find(
    (milestone) => milestone.id === milestoneForm.watch("dependsOnMilestoneId"));
  const selectedEditMilestoneDependency = topic?.milestones.find(
    (milestone) => milestone.id === editMilestoneForm.watch("dependsOnMilestoneId"));
  const unavailableEditMilestones = new Set<string>();
  if (editMilestone?.id && topic) {
    unavailableEditMilestones.add(editMilestone.id);
    let size = -1;
    while (size !== unavailableEditMilestones.size) {
      size = unavailableEditMilestones.size;
      for (const milestone of topic.milestones) {
        if (milestone.dependsOnMilestoneId &&
          unavailableEditMilestones.has(milestone.dependsOnMilestoneId)) {
          unavailableEditMilestones.add(milestone.id);
        }
      }
    }
  }
  const anchorMilestoneForm = (form: typeof milestoneForm, prerequisiteId: string) => {
    const anchor = dateInputValue(topic?.milestones.find(
      (milestone) => milestone.id === prerequisiteId)?.targetDate);
    if (!anchor) return;
    const begin = form.getValues("beginDate");
    const target = form.getValues("targetDate");
    if (begin === anchor) return;
    const duration = begin && target ? daysBetween(begin, target) : null;
    form.setValue("beginDate", anchor, { shouldValidate: true });
    if (duration !== null && duration >= 0) {
      form.setValue("targetDate", shiftedDate(anchor, duration), { shouldValidate: true });
    } else if (target && target < anchor) {
      form.setValue("targetDate", "", { shouldValidate: true });
    }
  };

  React.useEffect(() => {
    if (editMilestone?.open && editMilestone.id) {
      const m = topic?.milestones.find((x) => x.id === editMilestone.id);
      if (m) {
        editMilestoneForm.reset({
          title: m.title,
          description: m.description || "",
          beginDate: dateInputValue(m.beginDate),
          targetDate: dateInputValue(m.targetDate),
          assigneeId: m.assignee?.id || "none",
          dependsOnMilestoneId: m.dependsOnMilestoneId || "none",
        });
        setEditMilestoneAllocations(Object.fromEntries(
          m.allocations.map((allocation) => [allocation.member.id, allocation.allocationPercent]),
        ));
      }
    }
  }, [editMilestone, topic, editMilestoneForm]);

  const closeMilestoneForm = () => {
    setMilestoneOpen(false);
    milestoneForm.reset();
    setMilestoneAllocations({});
    setMilestoneError("");
    setFinishChoice(null);
  };

  const saveMilestoneWithChoice = (
    kind: "add" | "edit", payload: any, milestoneId?: string,
    extendTopicEstimatedFinish?: boolean,
  ) => {
    setFinishChoice(null);
    setMilestoneError("");
    const onError = (error: unknown) => {
      const suggestedFinishDate = finishDecisionDate(error);
      if (suggestedFinishDate) {
        setFinishChoice({ kind, milestoneId, payload, suggestedFinishDate });
        return;
      }
      setMilestoneError(error instanceof Error ? error.message : "Could not save milestone.");
    };
    if (kind === "add") {
      addMilestone.mutate({
        topicId: topicId!,
        data: { ...payload, extendTopicEstimatedFinish },
      }, {
        onSuccess: () => { closeMilestoneForm(); invalidateData(); },
        onError,
      });
    } else if (milestoneId) {
      updateMilestone.mutate({
        milestoneId,
        data: { ...payload, extendTopicEstimatedFinish },
      }, {
        onSuccess: () => { setEditMilestone(null); setFinishChoice(null); invalidateData(); },
        onError,
      });
    }
  };

  const onAddMilestone = (data: any) => {
    setMilestoneError("");
    const allocations = milestoneAllocationEntries(milestoneAllocations);
    if (!allocations) {
      setMilestoneError("Occupancy must be a whole percentage between 0 and 100.");
      return;
    }
    saveMilestoneWithChoice("add", {
      ...data,
      assigneeId: data.assigneeId === "none" ? null : data.assigneeId,
      dependsOnMilestoneId: data.dependsOnMilestoneId === "none" ? null : data.dependsOnMilestoneId,
      beginDate: data.beginDate,
      targetDate: data.targetDate,
      allocations,
    });
  };

  const onUpdateMilestoneForm = (data: any) => {
    if (!editMilestone?.id) return;
    setMilestoneError("");
    const allocations = milestoneAllocationEntries(editMilestoneAllocations);
    if (!allocations) {
      setMilestoneError("Occupancy must be a whole percentage between 0 and 100.");
      return;
    }
    saveMilestoneWithChoice("edit", {
      ...data,
      assigneeId: data.assigneeId === "none" ? null : data.assigneeId,
      dependsOnMilestoneId: data.dependsOnMilestoneId === "none" ? null : data.dependsOnMilestoneId,
      beginDate: data.beginDate || null,
      targetDate: data.targetDate || null,
      allocations,
    }, editMilestone.id);
  };

  const onUpdateMilestoneStatus = (
    milestoneId: string,
    status: "not_started" | "in_progress" | "returned" | "completed",
  ) => {
    setMilestoneStatusError("");
    updateMilestone.mutate(
      { milestoneId, data: { status } },
      {
        onSuccess: invalidateData,
        onError: (error) => setMilestoneStatusError(
          error instanceof Error ? error.message : "Could not update milestone status.",
        ),
      },
    );
  };

  const onDeleteMilestone = (milestoneId: string) => {
    const dependents = topic?.milestones.filter((milestone) =>
      milestone.dependsOnMilestoneId === milestoneId).length ?? 0;
    const warning = dependents
      ? `Delete this milestone? ${dependents} dependent milestone${dependents === 1 ? "" : "s"} will lose the prerequisite link, but keep their planned dates.`
      : "Are you sure you want to delete this milestone?";
    if (confirm(warning)) {
      deleteMilestone.mutate({ milestoneId }, { onSuccess: invalidateData });
    }
  };

  const onDeleteTopic = async () => {
    if (!topic || !topicId || !window.confirm(
      `Permanently delete "${topic.title}"? Its milestones, assignments, activity, and queued notifications will also be removed. This cannot be undone.`,
    )) return;
    setDeleteError("");
    try {
      await deleteTopic.mutateAsync({ topicId });
      navigate("/topics");
      queryClient.removeQueries({ queryKey: getGetTopicQueryKey(topicId) });
      void queryClient.invalidateQueries({
        predicate: ({ queryKey }) =>
          queryKey[0] !== getGetTopicQueryKey(topicId)[0],
      });
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Topic could not be deleted.");
    }
  };

  // Standard interactions
  const onAssign = (memberId: string) => {
    setAssignmentError("");
    assignTopic.mutate(
      { topicId: topicId!, data: { memberId: memberId === "none" ? null : memberId } },
      {
        onSuccess: invalidateData,
        onError: (error) => setAssignmentError(error instanceof Error ? error.message : "Could not change assignment."),
      },
    );
  };
  const onRemoveCollaborator = (collaboratorId: string, name: string) => {
    if (!window.confirm(
      `Remove ${name} from this topic? Their topic allocation and milestone links will also be removed.`,
    )) return;
    setAssignmentError("");
    deleteCollaborator.mutate(
      { topicId: topicId!, collaboratorId },
      {
        onSuccess: invalidateData,
        onError: (error) => setAssignmentError(error instanceof Error ? error.message : "Could not remove collaborator."),
      },
    );
  };
  const onStatusChange = (status: any) => {
    updateTopic.mutate(
      { topicId: topicId!, data: { status } },
      { onSuccess: invalidateData },
    );
  };
  const onValidate = (data: any) => {
    validateTopic.mutate(
      { topicId: topicId!, data },
      {
        onSuccess: () => {
          setValidationOpen(false);
          invalidateData();
        },
      },
    );
  };
  const onBreakGlass = (data: any) => {
    validateBreakGlass.mutate(
      { topicId: topicId!, data },
      {
        onSuccess: () => {
          setBreakGlassOpen(false);
          invalidateData();
        },
      },
    );
  };

  if (isLoading || !topic) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid md:grid-cols-3 gap-6">
          <Skeleton className="md:col-span-2 h-[500px]" />
          <Skeleton className="h-[500px]" />
        </div>
      </div>
    );
  }

  const isPendingValidation = topic.status === "pending_validation";
  const prerequisiteReady = !topic.dependency ||
    ["completed", "closed"].includes(topic.dependency.status);
  const userId = session?.user?.id;
  const canManageMilestones = Boolean(userId && (
    userId === topic.creator.id ||
    userId === topic.primaryAssignee?.id ||
    topic.collaborators?.some((entry) => entry.member.id === userId) ||
    userId === topic.role.lead.id ||
    userId === topic.role.deputy?.id ||
    userId === topic.department.serviceHead.id ||
    userId === topic.department.serviceHeadDeputy?.id
  ));
  const canDeleteTopic = Boolean(
    session?.capabilities?.includes("topic.delete") &&
    userId &&
    (
      (userId === "local-admin" && session.authProvider === "local") ||
      [topic.department.serviceHead.id, topic.department.serviceHeadDeputy?.id].includes(userId)
    ),
  );

  const availableCollabs = members?.filter(
    (m) =>
      m.id !== topic.primaryAssignee?.id &&
      !(topic.collaborators || []).some((c) => c.member.id === m.id),
  );

  const allocParticipants = Array.from(new Map([
    ...(topic.primaryAssignee ? [topic.primaryAssignee] : []),
    ...(topic.collaborators?.map((c) => c.member) || []),
  ].map((member) => [member.id, member] as const)).values());

  return (
    <div className="flex-1 space-y-6 p-8">
      {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
      {/* Header Area */}
      <div className="flex flex-col lg:flex-row gap-6 justify-between items-start">
        <div className="space-y-3 flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <PriorityBadge priority={topic.priority} />
            <StatusBadge status={topic.status} />
            <span className="text-sm font-mono text-muted-foreground">
              {topic.id}
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{topic.title}</h1>
          {topic.documentationUrl && (
            <a
              href={topic.documentationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-2 text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80"
            >
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="shrink-0">Documentation:</span>
              <span className="min-w-0 truncate">{topic.documentationUrl}</span>
            </a>
          )}
          <div className="flex flex-wrap items-center gap-4 text-sm font-mono bg-muted/50 p-3 rounded-sm border inline-flex">
            <div>
              <span className="text-muted-foreground">Dept:</span>{" "}
              <span className="font-semibold">{topic.department.name}</span>
            </div>
            <div className="w-px h-4 bg-border" />
            <div>
              <span className="text-muted-foreground">Role:</span>{" "}
              {topic.role.name}
            </div>
            <div className="w-px h-4 bg-border" />
            <div>
              <span className="text-muted-foreground">Created by:</span>{" "}
              {topic.creator.name}
            </div>
            <div className="w-px h-4 bg-border" />
            <div>
              <span className="text-muted-foreground">Date:</span>{" "}
              {formatDate(topic.createdAt)}
            </div>
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
                    <form
                      onSubmit={validationForm.handleSubmit(onValidate)}
                      className="space-y-4"
                    >
                      <FormField
                        control={validationForm.control}
                        name="note"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Approval Note (Optional)</FormLabel>
                            <FormControl>
                              <Textarea {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end gap-2 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setValidationOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          className="bg-yellow-600 hover:bg-yellow-700 text-white"
                        >
                          Approve Routing
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>

              <Dialog open={breakGlassOpen} onOpenChange={setBreakGlassOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="destructive"
                    className="gap-2 w-full sm:w-auto"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    Break Glass
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="text-destructive flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5" /> Break Glass
                      Validation
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground">
                      Bypass standard Service Head approval. This action is
                      heavily audited.
                    </p>
                  </DialogHeader>
                  <Form {...breakGlassForm}>
                    <form
                      onSubmit={breakGlassForm.handleSubmit(onBreakGlass)}
                      className="space-y-4"
                    >
                      <FormField
                        control={breakGlassForm.control}
                        name="reason"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Justification (Required, min 20 chars)
                            </FormLabel>
                            <FormControl>
                              <Textarea {...field} className="min-h-[100px]" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end gap-2 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setBreakGlassOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" variant="destructive">
                          Execute Break Glass
                        </Button>
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
                  <SelectItem value="in_progress" disabled={!prerequisiteReady}>In Progress</SelectItem>
                  <SelectItem value="completed" disabled={!prerequisiteReady}>Completed</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                  <SelectItem value="closed" disabled={!prerequisiteReady}>Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {canDeleteTopic && (
            <Button
              type="button"
              variant="destructive"
              className="gap-2 w-full sm:w-auto"
              disabled={deleteTopic.isPending}
              onClick={() => void onDeleteTopic()}
            >
              <Trash2 className="h-4 w-4" />
              {deleteTopic.isPending ? "Deleting…" : "Delete topic"}
            </Button>
          )}

          <Dialog open={editTopicOpen} onOpenChange={(open) => {
            setEditTopicOpen(open);
            if (!open) {
              setEditTopicError("");
              setTopicFinishChoice(null);
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" title="Edit Topic">
                <Pencil className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Edit Topic</DialogTitle>
              </DialogHeader>
              <Form {...editTopicForm}>
                {editTopicError && <p role="alert" className="text-sm text-destructive">{editTopicError}</p>}
                <form
                  onSubmit={editTopicForm.handleSubmit(onEditTopic)}
                  className="space-y-4"
                >
                  <fieldset disabled={Boolean(topicFinishChoice)} className="space-y-4">
                  <FormField
                    control={editTopicForm.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editTopicForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea {...field} className="min-h-[150px]" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editTopicForm.control}
                    name="documentationUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Documentation URL (optional)</FormLabel>
                        <FormControl>
                          <Input
                            type="url"
                            placeholder="https://example.com/documentation"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editTopicForm.control}
                      name="priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Priority</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="P1">P1</SelectItem>
                              <SelectItem value="P2">P2</SelectItem>
                              <SelectItem value="P3">P3</SelectItem>
                              <SelectItem value="P4">P4</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editTopicForm.control}
                      name="estimatedEffortHours"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estimated Hours</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={editTopicForm.control}
                    name="dependsOnTopicId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Starts after another topic (optional)</FormLabel>
                        <Select
                          value={field.value || "none"}
                          onValueChange={(value) => {
                            if (value === "none") {
                              field.onChange(null);
                              editTopicForm.setValue("estimatedStartDate", dateInputValue(topic.estimatedStartDate),
                                { shouldValidate: true });
                              editTopicForm.setValue("estimatedFinishDate", dateInputValue(topic.estimatedFinishDate),
                                { shouldValidate: true });
                              return;
                            }
                            const next = dependencyCandidates?.find((candidate) => candidate.id === value);
                            if (!next) return;
                            if (!next.estimatedFinishDate) {
                              field.onChange(value);
                              return;
                            }
                            const anchor = dateInputValue(next.estimatedFinishDate);
                            const start = editTopicForm.getValues("estimatedStartDate");
                            const finish = editTopicForm.getValues("estimatedFinishDate");
                            const duration = start && finish ? daysBetween(start, finish) : null;
                            field.onChange(value);
                            editTopicForm.setValue("estimatedStartDate", anchor, { shouldValidate: true });
                            if (duration !== null && duration >= 0) {
                              editTopicForm.setValue("estimatedFinishDate", shiftedDate(anchor, duration),
                                { shouldValidate: true });
                            } else if (finish && finish < anchor) {
                              editTopicForm.setValue("estimatedFinishDate", "", { shouldValidate: true });
                            }
                          }}
                        >
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="No prerequisite" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">No prerequisite</SelectItem>
                            {topic.dependency && (
                              <SelectItem value={topic.dependency.id}>
                                {topic.dependency.title} · {topic.dependency.status.replaceAll("_", " ")}
                              </SelectItem>
                            )}
                            {["pending_validation", "open"].includes(topic.status) &&
                              !topic.milestones.some((milestone) => ["in_progress", "completed"].includes(milestone.status)) &&
                              dependencyCandidates?.filter((candidate) => candidate.id !== topic.dependency?.id).map((candidate) => (
                                <SelectItem key={candidate.id} value={candidate.id}>
                                  {candidate.title} · {candidate.status.replaceAll("_", " ")} · {candidate.estimatedFinishDate
                                    ? formatDate(candidate.estimatedFinishDate) : "Finish not estimated"}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Changing the prerequisite keeps the planned duration and moves milestone dates.
                          If its finish is not estimated yet, these dates are tentative and will
                          move when a finish estimate is added. Work remains blocked until completion.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editTopicForm.control}
                      name="estimatedStartDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Est. Start Date</FormLabel>
                          <FormControl>
                            <DateField {...field} value={field.value || ""} disabled={Boolean(selectedEditDependency?.estimatedFinishDate)} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editTopicForm.control}
                      name="estimatedFinishDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Est. Finish Date</FormLabel>
                          <FormControl>
                            <DateField {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  </fieldset>
                  {topicFinishChoice && (
                    <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4 space-y-3 text-sm">
                      <p>
                        The latest milestone target is {formatDate(topicFinishChoice.suggestedFinishDate)},
                        after the proposed topic finish. Use the latest milestone date as the topic&apos;s
                        estimated finish instead?
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" disabled={updateTopic.isPending}
                          onClick={() => saveTopic({
                            ...topicFinishChoice.data,
                            estimatedFinishDate: topicFinishChoice.suggestedFinishDate,
                          })}>Use latest milestone date</Button>
                        <Button type="button" size="sm" variant="outline" disabled={updateTopic.isPending}
                          onClick={() => saveTopic(topicFinishChoice.data)}>Keep proposed topic finish</Button>
                        <Button type="button" size="sm" variant="ghost"
                          onClick={() => setTopicFinishChoice(null)}>Cancel change</Button>
                      </div>
                    </div>
                  )}
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditTopicOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={updateTopic.isPending || Boolean(topicFinishChoice)}>
                      {updateTopic.isPending ? "Saving..." : "Save Changes"}
                    </Button>
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
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" /> Topic
                  Description
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap">{topic.description}</p>
              </div>
              <div className="mt-6 flex flex-wrap gap-6 text-sm">
                {topic.estimatedStartDate && (
                  <div>
                    <span className="text-muted-foreground block text-xs uppercase mb-1 font-semibold">
                      Est. Start
                    </span>
                    {formatDate(topic.estimatedStartDate)}
                  </div>
                )}
                {topic.estimatedFinishDate && (
                  <div>
                    <span className="text-muted-foreground block text-xs uppercase mb-1 font-semibold">
                      Est. Finish
                    </span>
                    {formatDate(topic.estimatedFinishDate)}
                  </div>
                )}
                {topic.estimatedEffortHours != null && (
                  <div>
                    <span className="text-muted-foreground block text-xs uppercase mb-1 font-semibold">
                      Effort
                    </span>
                    {topic.estimatedEffortHours} hrs
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {topic.dependency && (
            <Card>
              <CardContent className="p-4 text-sm">
                <div className="font-medium">Starts after prerequisite</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Link href={`/topics/${topic.dependency.id}`} className="text-primary underline underline-offset-2">
                    {topic.dependency.title}
                  </Link>
                  <StatusBadge status={topic.dependency.status} />
                </div>
                <p className="mt-2 text-muted-foreground">
                  {topic.dependency.estimatedFinishDate
                    ? `Planned start follows its estimated finish (${formatDate(topic.dependency.estimatedFinishDate)}).`
                    : "The prerequisite has no estimated finish yet. This topic’s dates will update when one is added."}
                  {!prerequisiteReady && " Work cannot start until the prerequisite is completed."}
                  {" "}Changes to its estimated finish move this topic’s estimates and milestone dates by the same number of days.
                </p>
              </CardContent>
            </Card>
          )}

          <TabsRoot defaultValue="milestones">
            <TabsList className="w-full justify-start border-b border-border bg-transparent rounded-none p-0 h-auto mb-4">
              <TabsTrigger
                value="milestones"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              >
                <Target className="mr-2 h-4 w-4" />
                Milestones ({topic.completedMilestoneCount || 0}/
                {topic.milestoneCount || 0})
              </TabsTrigger>
              <TabsTrigger
                value="activity"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              >
                <Activity className="mr-2 h-4 w-4" />
                Activity
              </TabsTrigger>
            </TabsList>

            <TabsContent value="milestones">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/50">
                  <CardTitle className="text-lg">
                    Tracked Deliverables
                  </CardTitle>
                  {canManageMilestones && (
                    <Dialog
                      open={milestoneOpen}
                      onOpenChange={(open) => {
                        if (open) setMilestoneOpen(true);
                        else closeMilestoneForm();
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-2"
                          disabled={Boolean(topic.dependency && !topic.estimatedStartDate)}>
                          <Plus className="h-4 w-4" /> Add Milestone
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>New Milestone</DialogTitle>
                        </DialogHeader>
                        <Form {...milestoneForm}>
                          <form
                            onSubmit={milestoneForm.handleSubmit(
                              onAddMilestone,
                            )}
                            className="space-y-4"
                          >
                            <fieldset disabled={finishChoice?.kind === "add"} className="space-y-4">
                            <FormField
                              control={milestoneForm.control}
                              name="title"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Title</FormLabel>
                                  <FormControl>
                                    <Input {...field} />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={milestoneForm.control}
                              name="description"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Description (Optional)</FormLabel>
                                  <FormControl>
                                    <Textarea {...field} />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={milestoneForm.control}
                              name="dependsOnMilestoneId"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Starts after milestone (optional)</FormLabel>
                                  <Select value={field.value || "none"} onValueChange={(value) => {
                                    anchorMilestoneForm(milestoneForm, value);
                                    field.onChange(value);
                                  }}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="No prerequisite" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                      <SelectItem value="none">No prerequisite</SelectItem>
                                      {topic.milestones.map((candidate) => (
                                        <SelectItem key={candidate.id} value={candidate.id}>
                                          {candidate.title} · {candidate.targetDate
                                            ? formatDate(candidate.targetDate) : "Target not estimated"}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <p className="text-xs text-muted-foreground">
                                    Its target date sets this milestone&apos;s begin date. Later changes move dependent milestones.
                                  </p>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <div className="grid grid-cols-2 gap-4">
                              <FormField
                                control={milestoneForm.control}
                                name="beginDate"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Begin Date</FormLabel>
                                    <FormControl>
                                      <DateField {...field} required
                                        disabled={Boolean(selectedAddMilestoneDependency?.targetDate)} />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={milestoneForm.control}
                                name="targetDate"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Target Date</FormLabel>
                                    <FormControl>
                                      <DateField {...field} required />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={milestoneForm.control}
                                name="assigneeId"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Assignee (Optional)</FormLabel>
                                    <Select
                                      onValueChange={field.onChange}
                                      value={field.value || "none"}
                                    >
                                      <FormControl>
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="none">
                                          Unassigned
                                        </SelectItem>
                                        {sortedMembers.map((m) => (
                                          <SelectItem key={m.id} value={m.id}>
                                            {m.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </FormItem>
                                )}
                              />
                            </div>
                            <MilestoneAllocationFields
                              participants={allocParticipants}
                              values={milestoneAllocations}
                              deferredUntilValidation={isPendingValidation}
                              onChange={(memberId, value) =>
                                setMilestoneAllocations((current) => ({ ...current, [memberId]: value }))}
                            />
                            </fieldset>
                            {milestoneError && <p role="alert" className="text-sm text-destructive">{milestoneError}</p>}
                            {finishChoice?.kind === "add" && (
                              <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4 space-y-3 text-sm">
                                <p>
                                  The latest milestone would end on {formatDate(finishChoice.suggestedFinishDate)},
                                  after this topic&apos;s estimated finish ({formatDate(topic.estimatedFinishDate)}).
                                  Update the topic&apos;s estimated finish to the latest milestone date?
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  <Button type="button" size="sm" disabled={addMilestone.isPending}
                                    onClick={() => saveMilestoneWithChoice("add", finishChoice.payload, undefined, true)}>
                                    Update topic finish
                                  </Button>
                                  <Button type="button" size="sm" variant="outline" disabled={addMilestone.isPending}
                                    onClick={() => saveMilestoneWithChoice("add", finishChoice.payload, undefined, false)}>
                                    Keep topic finish
                                  </Button>
                                  <Button type="button" size="sm" variant="ghost"
                                    onClick={() => setFinishChoice(null)}>Cancel change</Button>
                                </div>
                              </div>
                            )}
                            <div className="flex justify-end gap-2 pt-4">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={closeMilestoneForm}
                              >
                                Cancel
                              </Button>
                              <Button type="submit" disabled={addMilestone.isPending || finishChoice?.kind === "add"}>
                                {addMilestone.isPending ? "Saving..." : "Add Milestone"}
                              </Button>
                            </div>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  {topic.dependency && !topic.estimatedStartDate && (
                    <p className="px-6 pt-4 text-sm text-muted-foreground">
                      Set a tentative estimated start in Topic edit before adding milestones.
                      Their dates can then move when the prerequisite gets a finish estimate.
                    </p>
                  )}
                  {milestoneStatusError && (
                    <p role="alert" className="px-6 pt-4 text-sm text-destructive">
                      {milestoneStatusError}
                    </p>
                  )}
                  {isPendingValidation && (
                    <p className="border-b bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                      You can plan milestone occupancy now. It will not count toward anyone’s occupancy until this topic is validated.
                    </p>
                  )}
                  {topic.milestones.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                      No milestones tracked for this topic.
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {topic.milestones.map((m) => (
                        <div
                          key={m.id}
                          className="p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex-1">
                            <div className="font-semibold">{m.title}</div>
                            {m.description && (
                              <div className="text-sm text-muted-foreground mt-1">
                                {m.description}
                              </div>
                            )}
                            {m.dependsOnMilestoneId && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Starts after {topic.milestones.find((entry) => entry.id === m.dependsOnMilestoneId)?.title
                                  ?? "another milestone"}
                              </p>
                            )}
                            <div className="flex gap-4 mt-2 text-xs font-mono text-muted-foreground">
                              {m.beginDate && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />{" "}
                                  {formatDate(m.beginDate)}
                                </span>
                              )}
                              {m.targetDate && (
                                <span className="flex items-center gap-1">
                                  <Target className="h-3 w-3" />{" "}
                                  {formatDate(m.targetDate)}
                                </span>
                              )}
                              {m.assignee && (
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />{" "}
                                  {m.assignee.name}
                                </span>
                              )}
                              {m.allocations.map((allocation) => (
                                <span
                                  key={allocation.member.id}
                                  className="rounded-sm border px-1 font-semibold"
                                  style={occupancyStyle(allocation.allocationPercent)}
                                >
                                  {allocation.member.name}: {allocation.allocationPercent}%
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <StatusBadge status={m.status} label={m.status === "completed" ? "Done" : undefined} />
                            {!isPendingValidation && canManageMilestones && (
                              <Select
                                value={m.status}
                                onValueChange={(status) => onUpdateMilestoneStatus(
                                  m.id,
                                  status as "not_started" | "in_progress" | "returned" | "completed",
                                )}
                                disabled={updateMilestone.isPending}
                              >
                                <SelectTrigger aria-label={`Status for ${m.title}`} className="h-8 w-[155px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="not_started">Not Started</SelectItem>
                                  <SelectItem value="in_progress" disabled={!prerequisiteReady ||
                                    Boolean(m.dependsOnMilestoneId && topic.milestones.find(
                                      (entry) => entry.id === m.dependsOnMilestoneId)?.status !== "completed")}>
                                    In Progress
                                  </SelectItem>
                                  <SelectItem value="returned">Returned</SelectItem>
                                  <SelectItem value="completed" disabled={!prerequisiteReady ||
                                    Boolean(m.dependsOnMilestoneId && topic.milestones.find(
                                      (entry) => entry.id === m.dependsOnMilestoneId)?.status !== "completed")}>
                                    Done
                                  </SelectItem>
                                  {m.status === "blocked" && (
                                    <SelectItem value="blocked" disabled>Blocked (legacy)</SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            )}
                            {canManageMilestones && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() =>
                                      setEditMilestone({ id: m.id, open: true })
                                    }
                                  >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit Milestone
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => onDeleteMilestone(m.id)}
                                    className="text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
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

              <Dialog
                open={Boolean(editMilestone?.open)}
                onOpenChange={(open) => {
                  if (!open) {
                    setEditMilestone(null);
                    setFinishChoice(null);
                    setMilestoneError("");
                  }
                }}
              >
                <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Edit Milestone</DialogTitle>
                  </DialogHeader>
                  <Form {...editMilestoneForm}>
                    <form
                      onSubmit={editMilestoneForm.handleSubmit(
                        onUpdateMilestoneForm,
                      )}
                      className="space-y-4"
                    >
                      <fieldset disabled={finishChoice?.kind === "edit"} className="space-y-4">
                      <FormField
                        control={editMilestoneForm.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Title</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editMilestoneForm.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description (Optional)</FormLabel>
                            <FormControl>
                              <Textarea {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editMilestoneForm.control}
                        name="dependsOnMilestoneId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Starts after milestone (optional)</FormLabel>
                            <Select value={field.value || "none"} onValueChange={(value) => {
                              anchorMilestoneForm(editMilestoneForm, value);
                              field.onChange(value);
                            }}>
                              <FormControl><SelectTrigger><SelectValue placeholder="No prerequisite" /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="none">No prerequisite</SelectItem>
                                {topic.milestones.filter((candidate) =>
                                  !unavailableEditMilestones.has(candidate.id)).map((candidate) => (
                                    <SelectItem key={candidate.id} value={candidate.id}
                                      disabled={topic.milestones.find((entry) => entry.id === editMilestone?.id)
                                        ?.status !== "not_started" && candidate.id !==
                                        topic.milestones.find((entry) => entry.id === editMilestone?.id)
                                          ?.dependsOnMilestoneId}>
                                      {candidate.title} · {candidate.targetDate
                                        ? formatDate(candidate.targetDate) : "Target not estimated"}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Changing the prerequisite preserves this milestone&apos;s duration and moves successors.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={editMilestoneForm.control}
                          name="beginDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Begin Date</FormLabel>
                              <FormControl>
                                <DateField
                                  {...field}
                                  value={field.value || ""}
                                  disabled={Boolean(selectedEditMilestoneDependency?.targetDate)}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={editMilestoneForm.control}
                          name="targetDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Target Date (Optional)</FormLabel>
                              <FormControl>
                                <DateField
                                  {...field}
                                  value={field.value || ""}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={editMilestoneForm.control}
                          name="assigneeId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Assignee (Optional)</FormLabel>
                              <Select
                              onValueChange={field.onChange}
                                value={field.value || "none"}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">
                                    Unassigned
                                  </SelectItem>
                                  {sortedMembers.map((m) => (
                                    <SelectItem key={m.id} value={m.id}>
                                      {m.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                      </div>
                      <MilestoneAllocationFields
                        participants={Array.from(new Map([
                          ...allocParticipants,
                          ...(topic.milestones.find((milestone) => milestone.id === editMilestone?.id)
                            ?.allocations.map((allocation) => allocation.member) ?? []),
                        ].map((member) => [member.id, member] as const)).values())}
                        values={editMilestoneAllocations}
                        deferredUntilValidation={isPendingValidation}
                        onChange={(memberId, value) =>
                          setEditMilestoneAllocations((current) => ({ ...current, [memberId]: value }))}
                      />
                      </fieldset>
                      {milestoneError && <p role="alert" className="text-sm text-destructive">{milestoneError}</p>}
                      {finishChoice?.kind === "edit" && (
                        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4 space-y-3 text-sm">
                          <p>
                            The latest milestone would end on {formatDate(finishChoice.suggestedFinishDate)},
                            after this topic&apos;s estimated finish ({formatDate(topic.estimatedFinishDate)}).
                            Update the topic&apos;s estimated finish to the latest milestone date?
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" disabled={updateMilestone.isPending}
                              onClick={() => saveMilestoneWithChoice("edit", finishChoice.payload,
                                finishChoice.milestoneId, true)}>Update topic finish</Button>
                            <Button type="button" size="sm" variant="outline" disabled={updateMilestone.isPending}
                              onClick={() => saveMilestoneWithChoice("edit", finishChoice.payload,
                                finishChoice.milestoneId, false)}>Keep topic finish</Button>
                            <Button type="button" size="sm" variant="ghost"
                              onClick={() => setFinishChoice(null)}>Cancel change</Button>
                          </div>
                        </div>
                      )}
                      <div className="flex justify-end gap-2 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setEditMilestone(null)}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" disabled={updateMilestone.isPending || finishChoice?.kind === "edit"}>
                          {updateMilestone.isPending ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </TabsContent>

            <TabsContent value="activity">
              <Card>
                <CardContent className="p-0">
                  {(topic.allocations?.length ?? 0) > 0 && (
                    <div className="border-b p-4 text-sm">
                      <div className="font-medium">Previous topic-level allocations</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Kept for reference only. These percentages no longer count toward occupancy.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {topic.allocations?.map((allocation) => (
                          <span key={allocation.member.id} className="rounded-sm border px-2 py-1">
                            {allocation.member.name}: {allocation.allocationPercent}%
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="h-[400px] overflow-auto p-6 space-y-6">
                    {topic.activity.length === 0 ? (
                      <div className="text-center text-sm text-muted-foreground">
                        No activity recorded.
                      </div>
                    ) : (
                      topic.activity.map((act) => (
                        <div key={act.id} className="flex gap-4 relative">
                          <div className="absolute left-3 top-6 bottom-[-24px] w-px bg-border last:hidden" />
                          <div
                            className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${act.isBreakGlass ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}`}
                          >
                            {act.isBreakGlass ? (
                              <AlertTriangle className="h-3 w-3" />
                            ) : (
                              <Activity className="h-3 w-3" />
                            )}
                          </div>
                          <div className="flex-1 pb-4">
                            <div className="text-sm">
                              <span className="font-semibold">
                                {act.actor.name}
                              </span>{" "}
                              {act.action}
                            </div>
                            {act.detail && (
                              <div className="text-sm text-muted-foreground mt-1 bg-muted/30 p-2 rounded-sm border">
                                {act.detail}
                              </div>
                            )}
                            <div className="text-xs font-mono text-muted-foreground mt-1">
                              {formatDateTime(act.createdAt)}
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
                <div className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wide">
                  Primary Accountability
                </div>
                {topic.primaryAssignee ? (
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {topic.primaryAssignee.initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-semibold">{topic.primaryAssignee.name}</span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Unassigned</span>
                )}
                <Select
                  value={topic.primaryAssignee?.id ?? "none"}
                  onValueChange={onAssign}
                  disabled={assignTopic.isPending || (isPendingValidation && !topic.primaryAssignee) ||
                    (!prerequisiteReady && topic.status === "open")}
                >
                  <SelectTrigger aria-label="Primary assignee" className="mt-3 w-full bg-background">
                    <SelectValue placeholder="Choose a primary assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {sortedMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isPendingValidation && !topic.primaryAssignee && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Validate this topic before making its first assignment.
                  </p>
                )}
                {assignmentError && <p role="alert" className="text-sm text-destructive mt-2">{assignmentError}</p>}
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wide">
                  <span>Collaborators</span>
                  {canManageMilestones && (
                    <Dialog
                      open={addCollabOpen}
                      onOpenChange={setAddCollabOpen}
                    >
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-2 text-xs"
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Collaborator</DialogTitle>
                        </DialogHeader>
                        <Form {...collabForm}>
                          <form
                            onSubmit={collabForm.handleSubmit(onAddCollab)}
                            className="space-y-4"
                          >
                            <FormField
                              control={collabForm.control}
                              name="memberId"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Member</FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select member" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {availableCollabs?.length === 0 && (
                                        <SelectItem value="none" disabled>
                                          No available members
                                        </SelectItem>
                                      )}
                                      {availableCollabs?.map((m) => (
                                        <SelectItem key={m.id} value={m.id}>
                                          {m.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </FormItem>
                              )}
                            />
                            <div className="flex justify-end gap-2 pt-4">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setAddCollabOpen(false)}
                              >
                                Cancel
                              </Button>
                              <Button type="submit">Add</Button>
                            </div>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
                <div className="space-y-2">
                  {topic.collaborators?.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 bg-muted/10 p-2 rounded-sm border"
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {c.member.initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">
                        {c.member.name}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-auto text-destructive"
                        aria-label={`Remove ${c.member.name} as collaborator`}
                        disabled={deleteCollaborator.isPending}
                        onClick={() => onRemoveCollaborator(c.id, c.member.name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {(!topic.collaborators ||
                    topic.collaborators.length === 0) && (
                    <div className="text-sm text-muted-foreground italic p-2">
                      None
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wide">
                  Validation details
                </div>
                {topic.validatedAt ? (
                  <div
                    className={`p-3 rounded-sm border ${topic.validationMode === "break_glass" ? "bg-destructive/10 border-destructive/20" : "bg-green-500/10 border-green-500/20"}`}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold mb-1">
                      {topic.validationMode === "break_glass" ? (
                        <ShieldAlert className="h-4 w-4 text-destructive" />
                      ) : (
                        <ShieldCheck className="h-4 w-4 text-green-600" />
                      )}
                      {topic.validationMode === "break_glass"
                        ? "Break-Glass Validation"
                        : "Standard Validation"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      By {topic.validator?.name} on{" "}
                      {formatDateTime(topic.validatedAt)}
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
                      <Button variant="outline" size="sm">
                        <History className="h-4 w-4 mr-2" /> Re-scope
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Re-scope Finish Date</DialogTitle>
                      </DialogHeader>
                      <Form {...rescopeForm}>
                        <form
                          onSubmit={rescopeForm.handleSubmit(onRescope)}
                          className="space-y-4"
                        >
                          <FormField
                            control={rescopeForm.control}
                            name="targetDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>New Target Date</FormLabel>
                                <FormControl>
                                  <DateField
                                    {...field}
                                    value={field.value || ""}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={rescopeForm.control}
                            name="note"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  Mandatory Note / Justification
                                </FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...field}
                                    className="min-h-[100px]"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="flex justify-end gap-2 pt-4">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setRescopeOpen(false)}
                            >
                              Cancel
                            </Button>
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
                  {formatDate(topic.estimatedFinishDate)}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground mb-6">
                  No estimated finish date set.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
