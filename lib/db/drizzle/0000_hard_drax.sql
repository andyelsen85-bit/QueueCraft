CREATE TYPE "public"."milestone_status" AS ENUM('not_started', 'in_progress', 'completed', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."topic_priority" AS ENUM('P1', 'P2', 'P3', 'P4');--> statement-breakpoint
CREATE TYPE "public"."topic_status" AS ENUM('pending_validation', 'open', 'in_progress', 'completed', 'closed', 'returned', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."validation_mode" AS ENUM('standard', 'break_glass');--> statement-breakpoint
CREATE TABLE "activity" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"detail" text,
	"is_break_glass" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collaborator_milestones" (
	"collaborator_id" text NOT NULL,
	"milestone_id" text NOT NULL,
	CONSTRAINT "collaborator_milestones_collaborator_id_milestone_id_pk" PRIMARY KEY("collaborator_id","milestone_id")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"service_head_id" text NOT NULL,
	"service_head_deputy_id" text,
	CONSTRAINT "departments_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"initials" text NOT NULL,
	"email" text NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "milestone_status" DEFAULT 'not_started' NOT NULL,
	"target_date" date,
	"assignee_id" text,
	"completion_note" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_members" (
	"role_id" text NOT NULL,
	"member_id" text NOT NULL,
	CONSTRAINT "role_members_role_id_member_id_pk" PRIMARY KEY("role_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"department_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"deputy_id" text
);
--> statement-breakpoint
CREATE TABLE "topic_collaborators" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"member_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"department_id" text NOT NULL,
	"role_id" text NOT NULL,
	"priority" "topic_priority" NOT NULL,
	"status" "topic_status" DEFAULT 'pending_validation' NOT NULL,
	"creator_id" text NOT NULL,
	"primary_assignee_id" text,
	"target_date" date,
	"validation_mode" "validation_mode" DEFAULT 'standard' NOT NULL,
	"validation_reason" text,
	"validator_id" text,
	"validated_at" timestamp with time zone,
	"completion_summary" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_actor_id_members_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaborator_milestones" ADD CONSTRAINT "collaborator_milestones_collaborator_id_topic_collaborators_id_fk" FOREIGN KEY ("collaborator_id") REFERENCES "public"."topic_collaborators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaborator_milestones" ADD CONSTRAINT "collaborator_milestones_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_service_head_id_members_id_fk" FOREIGN KEY ("service_head_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_service_head_deputy_id_members_id_fk" FOREIGN KEY ("service_head_deputy_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_assignee_id_members_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_members" ADD CONSTRAINT "role_members_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_members" ADD CONSTRAINT "role_members_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_lead_id_members_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_deputy_id_members_id_fk" FOREIGN KEY ("deputy_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_collaborators" ADD CONSTRAINT "topic_collaborators_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_collaborators" ADD CONSTRAINT "topic_collaborators_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_creator_id_members_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_primary_assignee_id_members_id_fk" FOREIGN KEY ("primary_assignee_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_validator_id_members_id_fk" FOREIGN KEY ("validator_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;