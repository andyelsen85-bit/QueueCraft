import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  membersTable,
  notificationRulesTable,
  notificationOutboxTable,
  roleMembersTable,
  rolesTable,
} from "@workspace/db";

export const NOTIFICATION_ACTIONS = [
  "directory.member.created", "directory.member.updated",
  "directory.department.created", "directory.department.updated",
  "directory.role.created", "directory.role.updated",
  "topic.created", "topic.updated", "topic.finish_date_changed", "topic.allocations_replaced",
  "topic.assignee_changed", "topic.validation", "topic.collaborator_added",
  "topic.milestone_added", "topic.milestone_updated", "topic.milestone_deleted",
] as const;
export type NotificationAction = (typeof NOTIFICATION_ACTIONS)[number];

const actionMap: Record<string, NotificationAction | undefined> = {
  "Directory member created": "directory.member.created",
  "Directory member updated": "directory.member.updated",
  "Department created": "directory.department.created",
  "Department updated": "directory.department.updated",
  "Role created": "directory.role.created",
  "Role updated": "directory.role.updated",
  "Topic created": "topic.created",
  "Topic updated": "topic.updated",
  "Committed finish date changed": "topic.finish_date_changed",
  "Weekly allocations replaced": "topic.allocations_replaced",
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

export async function enqueueRuleNotifications(
  executor: any,
  input: { action: string; topicId?: string | null; detail: string; isBreakGlass?: boolean },
) {
  if (input.isBreakGlass) return;
  const action = notificationAction(input.action);
  if (!action) return;
  const rules = await executor.select().from(notificationRulesTable).where(
    and(eq(notificationRulesTable.action, action), eq(notificationRulesTable.enabled, true)),
  );
  if (!rules.length) return;
  const roleIds = [...new Set(rules.map((rule: { roleId: string }) => rule.roleId))] as string[];
  const [roles, roleMembers] = await Promise.all([
    executor.select().from(rolesTable).where(inArray(rolesTable.id, roleIds)),
    executor.select().from(roleMembersTable).where(inArray(roleMembersTable.roleId, roleIds)),
  ]);
  const memberIds = [...new Set([
    ...roles.flatMap((role: { leadId: string; deputyId: string | null }) => [role.leadId, role.deputyId]),
    ...roleMembers.map((entry: { memberId: string }) => entry.memberId),
  ].filter(Boolean))] as string[];
  const recipients = await executor.select().from(membersTable).where(inArray(membersTable.id, memberIds));
  for (const recipient of recipients) {
    if (recipient.status !== "active" || !recipient.email) continue;
    await executor.insert(notificationOutboxTable).values({
      id: randomUUID(), topicId: input.topicId ?? null, recipient: recipient.email,
      subject: `QueueCraft: ${input.action}`, body: input.detail,
    });
  }
}