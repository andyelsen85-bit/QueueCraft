import {
  boolean,
  check,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

export const topicStatusEnum = pgEnum("topic_status", [
  "pending_validation",
  "open",
  "in_progress",
  "completed",
  "closed",
  "returned",
  "rejected",
]);

export const topicPriorityEnum = pgEnum("topic_priority", ["P1", "P2", "P3", "P4"]);
export const validationModeEnum = pgEnum("validation_mode", ["standard", "break_glass"]);
export const milestoneStatusEnum = pgEnum("milestone_status", [
  "not_started",
  "in_progress",
  "completed",
  "blocked",
]);
export const memberStatusEnum = pgEnum("member_status", ["active", "disabled"]);
export const notificationStatusEnum = pgEnum("notification_status", [
  "pending",
  "sent",
  "failed",
]);

export const membersTable = pgTable("members", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  initials: text("initials").notNull(),
  email: text("email").notNull().unique(),
  title: text("title"),
  externalSubject: text("external_subject").unique(),
  authProvider: text("auth_provider"),
  status: memberStatusEnum("status").notNull().default("active"),
  isCio: boolean("is_cio").notNull().default(false),
  dailyBusinessPercent: integer("daily_business_percent").notNull().default(0),
  topicFilterDepartmentId: text("topic_filter_department_id"),
  topicFilterRoleId: text("topic_filter_role_id"),
  topicFilterStatus: topicStatusEnum("topic_filter_status"),
  topicFilterPriority: topicPriorityEnum("topic_filter_priority"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [check("members_daily_business_percent_range", sql`${table.dailyBusinessPercent} between 0 and 100`)]);

export const departmentsTable = pgTable("departments", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  serviceHeadId: text("service_head_id")
    .notNull()
    .references(() => membersTable.id),
  serviceHeadDeputyId: text("service_head_deputy_id").references(() => membersTable.id),
});

export const rolesTable = pgTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  departmentId: text("department_id")
    .notNull()
    .references(() => departmentsTable.id),
  leadId: text("lead_id")
    .notNull()
    .references(() => membersTable.id),
  deputyId: text("deputy_id").references(() => membersTable.id),
});

export const roleDepartmentsTable = pgTable(
  "role_departments",
  {
    roleId: text("role_id")
      .notNull()
      .references(() => rolesTable.id),
    departmentId: text("department_id")
      .notNull()
      .references(() => departmentsTable.id),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.departmentId] })],
);

export const roleMembersTable = pgTable(
  "role_members",
  {
    roleId: text("role_id")
      .notNull()
      .references(() => rolesTable.id),
    memberId: text("member_id")
      .notNull()
      .references(() => membersTable.id),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.memberId] })],
);

export const topicsTable = pgTable("topics", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  departmentId: text("department_id")
    .notNull()
    .references(() => departmentsTable.id),
  roleId: text("role_id")
    .notNull()
    .references(() => rolesTable.id),
  priority: topicPriorityEnum("priority").notNull(),
  status: topicStatusEnum("status").notNull().default("pending_validation"),
  creatorId: text("creator_id")
    .notNull()
    .references(() => membersTable.id),
  primaryAssigneeId: text("primary_assignee_id").references(() => membersTable.id),
  targetDate: date("target_date", { mode: "string" }),
  estimatedStartDate: date("estimated_start_date", { mode: "string" }),
  estimatedFinishDate: date("estimated_finish_date", { mode: "string" }),
  estimatedEffortHours: integer("estimated_effort_hours"),
  validationMode: validationModeEnum("validation_mode").notNull().default("standard"),
  validationReason: text("validation_reason"),
  validatorId: text("validator_id").references(() => membersTable.id),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  completionSummary: text("completion_summary"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const topicCollaboratorsTable = pgTable("topic_collaborators", {
  id: text("id").primaryKey(),
  topicId: text("topic_id")
    .notNull()
    .references(() => topicsTable.id),
  memberId: text("member_id")
    .notNull()
    .references(() => membersTable.id),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

export const milestonesTable = pgTable("milestones", {
  id: text("id").primaryKey(),
  topicId: text("topic_id")
    .notNull()
    .references(() => topicsTable.id),
  title: text("title").notNull(),
  description: text("description"),
  status: milestoneStatusEnum("status").notNull().default("not_started"),
  targetDate: date("target_date", { mode: "string" }),
  assigneeId: text("assignee_id").references(() => membersTable.id),
  completionNote: text("completion_note"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const collaboratorMilestonesTable = pgTable(
  "collaborator_milestones",
  {
    collaboratorId: text("collaborator_id")
      .notNull()
      .references(() => topicCollaboratorsTable.id),
    milestoneId: text("milestone_id")
      .notNull()
      .references(() => milestonesTable.id),
  },
  (table) => [primaryKey({ columns: [table.collaboratorId, table.milestoneId] })],
);

export const topicWeeklyAllocationsTable = pgTable(
  "topic_weekly_allocations",
  {
    topicId: text("topic_id").notNull().references(() => topicsTable.id),
    memberId: text("member_id").notNull().references(() => membersTable.id),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    allocationPercent: integer("allocation_percent").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.topicId, table.memberId, table.weekStart] }),
    check("topic_weekly_allocations_percent_range", sql`${table.allocationPercent} between 0 and 100`),
  ],
);

export const topicFinishDateRevisionsTable = pgTable("topic_finish_date_revisions", {
  id: text("id").primaryKey(),
  topicId: text("topic_id").notNull().references(() => topicsTable.id),
  previousTargetDate: date("previous_target_date", { mode: "string" }),
  newTargetDate: date("new_target_date", { mode: "string" }),
  note: text("note").notNull(),
  actorId: text("actor_id").notNull().references(() => membersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityTable = pgTable("activity", {
  id: text("id").primaryKey(),
  topicId: text("topic_id").references(() => topicsTable.id),
  actorId: text("actor_id")
    .notNull()
    .references(() => membersTable.id),
  action: text("action").notNull(),
  detail: text("detail"),
  isBreakGlass: boolean("is_break_glass").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogTable = pgTable("audit_log", {
  id: text("id").primaryKey(),
  actorId: text("actor_id")
    .notNull()
    .references(() => membersTable.id),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  requestId: text("request_id"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  isBreakGlass: boolean("is_break_glass").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationOutboxTable = pgTable("notification_outbox", {
  id: text("id").primaryKey(),
  topicId: text("topic_id").references(() => topicsTable.id),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: notificationStatusEnum("status").notNull().default("pending"),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTopicSchema = createInsertSchema(topicsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertMilestoneSchema = createInsertSchema(milestonesTable).omit({
  createdAt: true,
});

export type InsertTopic = z.infer<typeof insertTopicSchema>;
export type TopicRecord = typeof topicsTable.$inferSelect;
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;
export type MilestoneRecord = typeof milestonesTable.$inferSelect;