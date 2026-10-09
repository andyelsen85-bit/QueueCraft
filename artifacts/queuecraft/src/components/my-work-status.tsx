import {
  useGetSession, useGetTopic, useUpdateMilestone, useUpdateTopic,
  type Topic, type Milestone, type TopicStatus, type MilestoneStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/badges";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/dates";

function managesTopic(topic: Topic, userId?: string) {
  return Boolean(userId && (
    topic.creator.id === userId || topic.primaryAssignee?.id === userId ||
    topic.collaborators?.some(c => c.member.id === userId) ||
    topic.role?.lead.id === userId || topic.role?.deputy?.id === userId ||
    topic.department?.serviceHead.id === userId || topic.department?.serviceHeadDeputy?.id === userId
  ));
}

export function WorkTopicStatus({ topic }: { topic: Topic }) {
  const { data: session } = useGetSession();
  const mutation = useUpdateTopic();
  const client = useQueryClient();
  const { toast } = useToast();
  if (!managesTopic(topic, session?.user?.id) ||
    ["pending_validation", "pipeline", "not_pursued"].includes(topic.status)) {
    return <StatusBadge status={topic.status} />;
  }
  const ready = !topic.dependency || ["completed", "closed"].includes(topic.dependency.status);
  return (
    <Select value={topic.status} disabled={mutation.isPending} onValueChange={status => {
      mutation.mutate({ topicId: topic.id, data: { status: status as TopicStatus } }, {
        onSuccess: () => { void client.invalidateQueries(); },
        onError: error => toast({ title: "Could not change topic status", description: error.message, variant: "destructive" }),
      });
    }}>
      <SelectTrigger aria-label={`Topic status for ${topic.title}`} className="w-[160px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="open">Open</SelectItem>
        <SelectItem value="in_progress" disabled={!ready}>In Progress</SelectItem>
        <SelectItem value="completed" disabled={!ready}>Completed</SelectItem>
        <SelectItem value="returned">Returned</SelectItem>
        <SelectItem value="closed" disabled={!ready}>Closed</SelectItem>
        {topic.status === "rejected" && <SelectItem value="rejected" disabled>Rejected</SelectItem>}
      </SelectContent>
    </Select>
  );
}

export function WorkMilestoneCard({ milestone }: { milestone: Milestone }) {
  const { data: topic } = useGetTopic(milestone.topicId);
  const { data: session } = useGetSession();
  const mutation = useUpdateMilestone();
  const client = useQueryClient();
  const { toast } = useToast();
  const editable = topic && managesTopic(topic, session?.user?.id) &&
    !["pending_validation", "pipeline", "not_pursued"].includes(topic.status);
  const ready = topic && (!topic.dependency || ["completed", "closed"].includes(topic.dependency.status)) &&
    (!milestone.dependsOnMilestoneId ||
      topic.milestones.some(m => m.id === milestone.dependsOnMilestoneId && m.status === "completed"));
  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardContent className="p-4 flex flex-wrap items-center gap-4">
        <Link href={`/topics/${milestone.topicId}`} className="flex-1 min-w-0 hover:text-primary" aria-label={`Open topic for ${milestone.title}`}>
          <h3 className="text-sm font-semibold">{milestone.title}</h3>
          {topic && <p className="text-xs text-muted-foreground mt-1">Topic: {topic.title}</p>}
          <p className="text-xs text-muted-foreground mt-1 font-mono">{formatDate(milestone.beginDate)} – {formatDate(milestone.targetDate)}</p>
        </Link>
        {editable ? (
          <Select value={milestone.status} disabled={mutation.isPending} onValueChange={status => {
            mutation.mutate({ milestoneId: milestone.id, data: { status: status as MilestoneStatus } }, {
              onSuccess: () => { void client.invalidateQueries(); },
              onError: error => toast({ title: "Could not change milestone status", description: error.message, variant: "destructive" }),
            });
          }}>
            <SelectTrigger aria-label={`Milestone status for ${milestone.title}`} className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="not_started">Not Started</SelectItem>
              <SelectItem value="in_progress" disabled={!ready}>In Progress</SelectItem>
              <SelectItem value="returned">Returned</SelectItem>
              <SelectItem value="completed" disabled={!ready}>Done</SelectItem>
              {milestone.status === "blocked" && <SelectItem value="blocked" disabled>Blocked (legacy)</SelectItem>}
            </SelectContent>
          </Select>
        ) : <StatusBadge status={milestone.status} />}
      </CardContent>
    </Card>
  );
}
