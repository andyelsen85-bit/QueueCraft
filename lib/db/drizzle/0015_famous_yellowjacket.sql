CREATE TABLE "notification_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"frequency_minutes" integer DEFAULT 5 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "action" text;--> statement-breakpoint
UPDATE "notification_outbox" SET "action" = CASE
	WHEN "subject" LIKE 'QueueCraft break-glass validation:%' THEN 'security.break_glass_alert'
	WHEN "subject" = 'QueueCraft: Topic created' THEN 'topic.created'
	WHEN "subject" = 'QueueCraft: Topic updated' THEN 'topic.updated'
	WHEN "subject" = 'QueueCraft: Committed finish date changed' THEN 'topic.finish_date_changed'
	WHEN "subject" = 'QueueCraft: Topic allocations replaced' THEN 'topic.allocations_replaced'
	WHEN "subject" = 'QueueCraft: Primary assignee changed' THEN 'topic.assignee_changed'
	WHEN "subject" = 'QueueCraft: Topic validated' THEN 'topic.validation'
	WHEN "subject" = 'QueueCraft: Collaborator added' THEN 'topic.collaborator_added'
	WHEN "subject" = 'QueueCraft: Milestone added' THEN 'topic.milestone_added'
	WHEN "subject" = 'QueueCraft: Milestone updated' THEN 'topic.milestone_updated'
	WHEN "subject" = 'QueueCraft: Milestone deleted' THEN 'topic.milestone_deleted'
	ELSE 'topic.updated'
END;--> statement-breakpoint
ALTER TABLE "notification_outbox" ALTER COLUMN "action" SET DEFAULT 'topic.updated';--> statement-breakpoint
ALTER TABLE "notification_outbox" ALTER COLUMN "action" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_rules" ADD COLUMN "recipient_groups" text[] DEFAULT '{"affected_role_members","head_of_service","head_of_service_deputy","lead_of_affected_role","deputy_of_affected_role"}' NOT NULL;