ALTER TABLE "members" ADD COLUMN "topic_filter_role_id" text;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;