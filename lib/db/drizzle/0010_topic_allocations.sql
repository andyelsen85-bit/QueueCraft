UPDATE "milestones"
SET "begin_date" = "target_date"
WHERE "begin_date" IS NULL AND "target_date" IS NOT NULL;--> statement-breakpoint
CREATE TABLE "topic_allocations" (
  "topic_id" text NOT NULL,
  "member_id" text NOT NULL,
  "allocation_percent" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "topic_allocations_topic_id_member_id_pk" PRIMARY KEY("topic_id","member_id"),
  CONSTRAINT "topic_allocations_percent_range" CHECK ("topic_allocations"."allocation_percent" between 0 and 100)
);--> statement-breakpoint
ALTER TABLE "topic_allocations" ADD CONSTRAINT "topic_allocations_topic_id_topics_id_fk"
  FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_allocations" ADD CONSTRAINT "topic_allocations_member_id_members_id_fk"
  FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "topic_allocations" ("topic_id", "member_id", "allocation_percent", "created_at", "updated_at")
SELECT DISTINCT ON ("topic_id", "member_id")
  "topic_id", "member_id", "allocation_percent", "created_at", "updated_at"
FROM "topic_weekly_allocations"
ORDER BY "topic_id", "member_id", "updated_at" DESC, "week_start" DESC;--> statement-breakpoint
DROP TABLE "topic_weekly_allocations";