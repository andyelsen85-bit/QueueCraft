ALTER TYPE "public"."topic_status" ADD VALUE 'pipeline' BEFORE 'pending_validation';--> statement-breakpoint
ALTER TYPE "public"."topic_status" ADD VALUE 'not_pursued' BEFORE 'pending_validation';--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "pipeline_waiting_for" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "pipeline_review_date" date;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "pipeline_exit_reason" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "pipeline_review_notified_at" timestamp with time zone;