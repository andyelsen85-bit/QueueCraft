import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  departmentsTable,
  membersTable,
  notificationRulesTable,
  notificationOutboxTable,
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
) {
  return [...new Set([
    ...roles.flatMap((role) => [role.leadId, role.deputyId]),
    ...departments.flatMap((department) => [department.serviceHeadId, department.serviceHeadDeputyId]),
    ...roleMembers.map((entry) => entry.memberId),
  ].filter(Boolean))] as string[];
}

export async function enqueueRuleNotifications(
  executor: any,
  input: { action: string; topicId?: string | null; detail: string; isBreakGlass?: boolean },
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
  const [roles, departments, roleMembers] = await Promise.all([
    executor.select().from(rolesTable).where(eq(rolesTable.id, topic.roleId)),
    executor.select().from(departmentsTable).where(eq(departmentsTable.id, topic.departmentId)),
    executor.select().from(roleMembersTable).where(eq(roleMembersTable.roleId, topic.roleId)),
  ]);
  const memberIds = collectTopicNotificationMemberIds(roles, departments, roleMembers);
  if (!memberIds.length) return;
  const recipients = await executor.select().from(membersTable).where(inArray(membersTable.id, memberIds));
  for (const recipient of recipients) {
    if (recipient.status !== "active" || !recipient.email) continue;
    await executor.insert(notificationOutboxTable).values({
      id: randomUUID(), topicId: input.topicId ?? null, recipient: recipient.email,
      subject: `QueueCraft: ${input.action}`, body: input.detail,
    });
  }
}