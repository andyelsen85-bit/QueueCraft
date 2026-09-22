CREATE TABLE "topic_finish_date_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"previous_target_date" date,
	"new_target_date" date,
	"note" text NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_weekly_allocations" (
	"topic_id" text NOT NULL,
	"member_id" text NOT NULL,
	"week_start" date NOT NULL,
	"allocation_percent" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_weekly_allocations_topic_id_member_id_week_start_pk" PRIMARY KEY("topic_id","member_id","week_start")
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "daily_business_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "estimated_start_date" date;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "estimated_finish_date" date;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "estimated_effort_hours" integer;--> statement-breakpoint
ALTER TABLE "topic_finish_date_revisions" ADD CONSTRAINT "topic_finish_date_revisions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_finish_date_revisions" ADD CONSTRAINT "topic_finish_date_revisions_actor_id_members_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_weekly_allocations" ADD CONSTRAINT "topic_weekly_allocations_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_weekly_allocations" ADD CONSTRAINT "topic_weekly_allocations_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;