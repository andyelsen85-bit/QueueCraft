import { randomUUID } from "node:crypto";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { db, topicsTable, notificationRulesTable } from "@workspace/db";
import { enqueueRuleNotifications } from "./notifications";

/** One digest reminder per review date, claimed atomically across API replicas. */
export async function enqueuePipelineReviewReminders() {
  return db.transaction(async (tx) => {
    await tx.insert(notificationRulesTable).values({
      id: randomUUID(), action: "topic.pipeline_review_due", enabled: true,
      recipientGroups: ["head_of_service", "head_of_service_deputy"],
    }).onConflictDoNothing();
    const [rule] = await tx.select().from(notificationRulesTable)
      .where(eq(notificationRulesTable.action, "topic.pipeline_review_due"));
    if (!rule?.enabled) return 0;
    const due = await tx.select().from(topicsTable).where(and(
      eq(topicsTable.status, "pipeline"),
      lte(topicsTable.pipelineReviewDate, sql`CURRENT_DATE`),
      isNull(topicsTable.pipelineReviewNotifiedAt),
    )).limit(100).for("update", { skipLocked: true });
    for (const topic of due) {
      await enqueueRuleNotifications(tx, {
        action: "Pipeline review due", topicId: topic.id, actorId: topic.creatorId,
        detail: `Review date: ${topic.pipelineReviewDate}\nWaiting for: ${topic.pipelineWaitingFor?.replaceAll("_", " ") ?? "Not specified"}\nPlease review whether to activate or stop pursuing this topic.`,
      });
      await tx.update(topicsTable).set({ pipelineReviewNotifiedAt: new Date() })
        .where(eq(topicsTable.id, topic.id));
    }
    return due.length;
  });
}
