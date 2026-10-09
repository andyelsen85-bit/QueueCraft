import * as React from "react";
import { useUpdateTopic, type TopicDetail } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/dates";
import { ArrowRightCircle, Ban, Pencil } from "lucide-react";

export const WAITING_FOR_LABELS: Record<string, string> = {
  decision: "A decision",
  budget: "Budget",
  vendor: "A vendor",
  partner_input: "Partner input",
};

type PipelineTopic = TopicDetail;
type PipelineWaitingFor = NonNullable<TopicDetail["pipelineWaitingFor"]>;

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export function PipelineActions({
  topic,
  onChanged,
}: {
  topic: PipelineTopic;
  onChanged: () => void;
}) {
  const updateTopic = useUpdateTopic();
  const [moveOpen, setMoveOpen] = React.useState(false);
  const [exitOpen, setExitOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState("");
  const routingSet = Boolean(topic.department?.id && topic.role?.id);

  if (topic.status !== "pipeline") return null;

  const move = () => {
    if (!routingSet) return;
    setError("");
    updateTopic.mutate(
      { topicId: topic.id, data: { status: "pending_validation" } },
      {
        onSuccess: () => {
          setMoveOpen(false);
          onChanged();
        },
        onError: (e) => setError(errorText(e, "Could not move this topic to active.")),
      },
    );
  };

  const exit = () => {
    setError("");
    updateTopic.mutate(
      {
        topicId: topic.id,
        data: { status: "not_pursued", pipelineExitReason: reason.trim() },
      },
      {
        onSuccess: () => {
          setExitOpen(false);
          setReason("");
          onChanged();
        },
        onError: (e) => setError(errorText(e, "Could not mark this topic as not pursued.")),
      },
    );
  };

  return (
    <>
      <Button
        className="gap-2 w-full sm:w-auto"
        data-testid="button-move-to-active"
        disabled={!routingSet || updateTopic.isPending}
        title={!routingSet ? "Assign a department and role using Edit topic before activation." : "Submit this topic for department validation."}
        onClick={() => {
          setError("");
          setMoveOpen(true);
        }}
      >
        <ArrowRightCircle className="h-4 w-4" />
        Move to active
      </Button>
      <Button
        variant="outline"
        className="gap-2 w-full sm:w-auto"
        data-testid="button-not-pursued"
        onClick={() => {
          setError("");
          setExitOpen(true);
        }}
      >
        <Ban className="h-4 w-4" />
        Not pursued
      </Button>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to active</DialogTitle>
            <DialogDescription>
              This topic keeps its identity and enters Pending Validation. It
              always needs approval from the Head or Deputy of its department,
              even if you created it or lead that department.
            </DialogDescription>
          </DialogHeader>
          {!routingSet && (
            <p role="alert" className="text-sm text-destructive" data-testid="text-routing-required">
              Set a department and role first. Use Edit topic to choose where this work is routed, then move it to active.
            </p>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)}>Cancel</Button>
            <Button onClick={move} disabled={!routingSet || updateTopic.isPending} data-testid="button-confirm-move">
              {updateTopic.isPending ? "Moving..." : "Submit for approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exitOpen} onOpenChange={setExitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as not pursued</DialogTitle>
            <DialogDescription>
              This is final. Record why the topic will not move forward.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason this topic is not being pursued"
            className="min-h-[100px]"
            maxLength={1000}
            data-testid="input-exit-reason"
          />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExitOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={exit}
              disabled={!reason.trim() || updateTopic.isPending}
              data-testid="button-confirm-not-pursued"
            >
              {updateTopic.isPending ? "Saving..." : "Confirm not pursued"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PipelinePanel({
  topic,
  onChanged,
  canEdit = true,
}: {
  topic: PipelineTopic;
  onChanged: () => void;
  canEdit?: boolean;
}) {
  const updateTopic = useUpdateTopic();
  const [open, setOpen] = React.useState(false);
  const [waiting, setWaiting] = React.useState("none");
  const [review, setReview] = React.useState("");
  const [error, setError] = React.useState("");

  if (topic.status === "not_pursued") {
    return (
      <Card data-testid="card-exit-reason">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-lg">Not pursued</CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-2">
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-wide">
            Recorded reason
          </div>
          <p className="text-sm whitespace-pre-wrap" data-testid="text-exit-reason">
            {topic.pipelineExitReason || "No reason recorded."}
          </p>
        </CardContent>
      </Card>
    );
  }
  if (topic.status !== "pipeline") return null;

  const openEdit = () => {
    setWaiting(topic.pipelineWaitingFor ?? "none");
    setReview(topic.pipelineReviewDate ? String(topic.pipelineReviewDate).slice(0, 10) : "");
    setError("");
    setOpen(true);
  };

  const save = () => {
    setError("");
    updateTopic.mutate(
      {
        topicId: topic.id,
        data: {
          pipelineWaitingFor: waiting === "none" ? null : (waiting as PipelineWaitingFor),
          pipelineReviewDate: review || null,
        },
      },
      {
        onSuccess: () => {
          setOpen(false);
          onChanged();
        },
        onError: (e) => setError(errorText(e, "Could not save pipeline details.")),
      },
    );
  };

  return (
    <Card data-testid="card-pipeline">
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Pipeline</CardTitle>
          {canEdit && <Button variant="outline" size="sm" className="gap-2" onClick={openEdit} data-testid="button-edit-pipeline">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>}
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-4 text-sm">
        <div>
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-wide mb-1">Waiting for</div>
          <div data-testid="text-waiting-for">
            {topic.pipelineWaitingFor
              ? WAITING_FOR_LABELS[topic.pipelineWaitingFor] ?? topic.pipelineWaitingFor
              : "Nothing recorded"}
          </div>
        </div>
        <div>
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-wide mb-1">Review date</div>
          <div data-testid="text-review-date">
            {topic.pipelineReviewDate ? formatDate(topic.pipelineReviewDate) : "Not set"}
          </div>
        </div>
        <div>
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-wide mb-1">Estimated effort</div>
          <div data-testid="text-pipeline-effort">
            {topic.estimatedEffortHours != null ? `${topic.estimatedEffortHours} h` : "Not estimated"}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Pipeline topics hold no milestones, allocations or schedule, and do not count as booked work.
        </p>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit pipeline details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Waiting for</label>
              <Select value={waiting} onValueChange={setWaiting}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nothing</SelectItem>
                  {Object.entries(WAITING_FOR_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Review date</label>
              <DateField value={review} onChange={(v: any) => setReview(typeof v === "string" ? v : v?.target?.value ?? "")} />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={updateTopic.isPending} data-testid="button-save-pipeline">
              {updateTopic.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
