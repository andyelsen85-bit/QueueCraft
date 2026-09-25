CREATE TABLE "milestone_allocations" (
	"milestone_id" text NOT NULL,
	"member_id" text NOT NULL,
	"allocation_percent" integer NOT NULL,
	CONSTRAINT "milestone_allocations_milestone_id_member_id_pk" PRIMARY KEY("milestone_id","member_id"),
	CONSTRAINT "milestone_allocations_percent_range" CHECK ("milestone_allocations"."allocation_percent" between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "milestone_allocations" ADD CONSTRAINT "milestone_allocations_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_allocations" ADD CONSTRAINT "milestone_allocations_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;