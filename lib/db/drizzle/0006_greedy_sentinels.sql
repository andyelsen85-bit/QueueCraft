CREATE TABLE "application_settings" (
	"id" text PRIMARY KEY DEFAULT 'runtime' NOT NULL,
	"encrypted_value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_id" text
);
--> statement-breakpoint
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_updated_by_id_members_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;