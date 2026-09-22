CREATE TABLE "role_departments" (
	"role_id" text NOT NULL,
	"department_id" text NOT NULL,
	CONSTRAINT "role_departments_role_id_department_id_pk" PRIMARY KEY("role_id","department_id")
);
--> statement-breakpoint
ALTER TABLE "role_departments" ADD CONSTRAINT "role_departments_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_departments" ADD CONSTRAINT "role_departments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;