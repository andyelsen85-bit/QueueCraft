ALTER TABLE "members" ADD COLUMN "daily_business_tasks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "members"
SET "daily_business_tasks" = jsonb_build_array(
  jsonb_build_object('name', 'Standard Operations', 'percent', "daily_business_percent")
)
WHERE "daily_business_percent" > 0;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_daily_business_tasks_json" CHECK (jsonb_typeof("members"."daily_business_tasks") = 'array');