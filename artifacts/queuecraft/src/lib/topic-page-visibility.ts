export type TopicPageMode = "topics" | "pipeline";
export type PipelineViewStatus = "pipeline" | "not_pursued";
export const HIDDEN_TOPIC_STATUSES = ["pending_validation", "pipeline", "not_pursued"];

export function isTopicInPage(
  status: string,
  mode: TopicPageMode,
  pipelineStatus: PipelineViewStatus = "pipeline",
) {
  return mode === "pipeline"
    ? status === pipelineStatus
    : !HIDDEN_TOPIC_STATUSES.includes(status);
}
