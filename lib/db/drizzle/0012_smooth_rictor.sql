ALTER TABLE "notification_rules" DROP CONSTRAINT "notification_rules_role_id_roles_id_fk";
--> statement-breakpoint
DROP INDEX "notification_rules_action_role_unique";--> statement-breakpoint
DELETE FROM "notification_rules"
WHERE "action" NOT LIKE 'topic.%';--> statement-breakpoint
WITH "ranked_rules" AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "action"
      ORDER BY "enabled" DESC, "updated_at" DESC, "id"
    ) AS "position"
  FROM "notification_rules"
)
DELETE FROM "notification_rules"
USING "ranked_rules"
WHERE "notification_rules"."id" = "ranked_rules"."id"
  AND "ranked_rules"."position" > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_rules_action_unique" ON "notification_rules" USING btree ("action");--> statement-breakpoint
ALTER TABLE "notification_rules" DROP COLUMN "role_id";