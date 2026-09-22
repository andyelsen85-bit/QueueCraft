import {
  boolean,
  date,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
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

export const membersTable = pgTable("members", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  initials: text("initials").notNull(),
  email: text("email").notNull().unique(),
  title: text("title"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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