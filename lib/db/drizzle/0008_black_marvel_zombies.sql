ALTER TABLE "milestones" ADD COLUMN "begin_date" date;--> statement-breakpoint
ALTER TABLE "milestones" ADD COLUMN "workload_percent" integer DEFAULT 0 NOT NULL;