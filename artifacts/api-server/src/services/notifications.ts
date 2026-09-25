import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  departmentsTable,
  membersTable,
  notificationOutboxTable,
  notificationRulesTable,
  notificationSettingsTable,
  roleMembersTable,
  rolesTable,
  topicsTable,
} from "@workspace/db";

export const NOTIFICATION_ACTIONS = [
  "topic.created", "topic.updated", "topic.finish_date_changed", "topic.allocations_replaced",
  "topic.assignee_changed", "topic.validation", "topic.collaborator_added",
  "topic.milestone_added", "topic.milestone_updated", "topic.milestone_deleted",
] as const;
export type NotificationAction = (typeof NOTIFICATION_ACTIONS)[number];
export const BREAK_GLASS_NOTIFICATION_ACTION = "security.break_glass_alert";

export const NOTIFICATION_RECIPIENT_GROUPS = [
  "affected_role_members",
  "head_of_service",
  "head_of_service_deputy",
  "lead_of_affected_role",
  "deputy_of_affected_role",
] as const;
export type NotificationRecipientGroup = (typeof NOTIFICATION_RECIPIENT_GROUPS)[number];
export const DEFAULT_NOTIFICATION_GROUPS: NotificationRecipientGroup[] = [...NOTIFICATION_RECIPIENT_GROUPS];

const actionMap: Record<string, NotificationAction | undefined> = {
  "Topic created": "topic.created",
  "Topic updated": "topic.updated",
  "Committed finish date changed": "topic.finish_date_changed",
  "Topic allocations replaced": "topic.allocations_replaced",
  "Primary assignee changed": "topic.assignee_changed",
  "Topic validated": "topic.validation",
  "Collaborator added": "topic.collaborator_added",
  "Milestone added": "topic.milestone_added",
  "Milestone updated": "topic.milestone_updated",
  "Milestone deleted": "topic.milestone_deleted",
};

export function notificationAction(label: string) {
  return actionMap[label];
}

export function collectTopicNotificationMemberIds(
  roles: Array<{ leadId: string; deputyId: string | null }>,
  departments: Array<{ serviceHeadId: string; serviceHeadDeputyId: string | null }>,
  roleMembers: Array<{ memberId: string }>,
  groups: readonly NotificationRecipientGroup[] = DEFAULT_NOTIFICATION_GROUPS,
) {
  const selected = new Set(groups);
  return [...new Set([
    ...(selected.has("lead_of_affected_role") ? roles.map((role) => role.leadId) : []),
    ...(selected.has("deputy_of_affected_role") ? roles.map((role) => role.deputyId) : []),
    ...(selected.has("head_of_service") ? departments.map((department) => department.serviceHeadId) : []),
    ...(selected.has("head_of_service_deputy") ? departments.map((department) => department.serviceHeadDeputyId) : []),
    ...(selected.has("affected_role_members") ? roleMembers.map((entry) => entry.memberId) : []),
  ].filter((id): id is string => Boolean(id)))];
}

export async function enqueueRuleNotifications(
  executor: any,
  input: { action: string; topicId?: string | null; detail: string; actorId: string; isBreakGlass?: boolean },
) {
  if (input.isBreakGlass) return;
  const action = notificationAction(input.action);
  if (!action || !input.topicId) return;
  const [rule] = await executor.select().from(notificationRulesTable).where(
    and(eq(notificationRulesTable.action, action), eq(notificationRulesTable.enabled, true)),
  ).limit(1);
  if (!rule) return;
  const [topic] = await executor.select().from(topicsTable).where(eq(topicsTable.id, input.topicId)).limit(1);
  if (!topic) return;
  const [roles, departments, roleMembers, [settings]] = await Promise.all([
    executor.select().from(rolesTable).where(eq(rolesTable.id, topic.roleId)),
    executor.select().from(departmentsTable).where(eq(departmentsTable.id, topic.departmentId)),
    executor.select().from(roleMembersTable).where(eq(roleMembersTable.roleId, topic.roleId)),
    executor.select().from(notificationSettingsTable).where(eq(notificationSettingsTable.id, "default")).limit(1),
  ]);
  const [actor] = await executor.select({ name: membersTable.name }).from(membersTable)
    .where(eq(membersTable.id, input.actorId)).limit(1);
  const memberIds = collectTopicNotificationMemberIds(roles, departments, roleMembers, rule.recipientGroups);
  if (!memberIds.length) return;
  const recipients = await executor.select().from(membersTable).where(inArray(membersTable.id, memberIds));
  const unique = new Map<string, string>();
  for (const recipient of recipients) {
    if (recipient.status === "active" && recipient.email) {
      unique.set(recipient.email.trim().toLowerCase(), recipient.email.trim());
    }
  }
  if (!unique.size) return;
  const frequencyMinutes = settings?.frequencyMinutes ?? 5;
  const now = new Date();
  const nextByRecipient = new Map<string, Date>();
  for (const email of [...unique.keys()].sort()) {
    await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext(lower(${email})), 731904221)`);
  }
  const queued = await executor.select({
    recipient: notificationOutboxTable.recipient,
    nextAttemptAt: notificationOutboxTable.nextAttemptAt,
  }).from(notificationOutboxTable).where(and(
    inArray(notificationOutboxTable.status, ["pending", "failed"]),
    inArray(sql`lower(${notificationOutboxTable.recipient})`, [...unique.keys()]),
  ));
  for (const item of queued) {
    const key = item.recipient.trim().toLowerCase();
    const prior = nextByRecipient.get(key);
    if (!prior || item.nextAttemptAt < prior) nextByRecipient.set(key, item.nextAttemptAt);
  }
  await executor.insert(notificationOutboxTable).values([...unique.values()].map((recipient) => ({
    id: randomUUID(),
    topicId: input.topicId!,
    recipient,
    action,
    topicTitle: topic.title,
    actorName: actor?.name ?? input.actorId,
    subject: `QueueCraft: ${input.action}`,
    body: input.detail,
    // All changes for an already-queued recipient share the first item’s
    // delivery deadline, so changes within the digest window stay together.
    nextAttemptAt: nextByRecipient.get(recipient.toLowerCase()) ?? new Date(now.getTime() + frequencyMinutes * 60_000),
  })));
}