ALTER TABLE "notification_outbox" ADD COLUMN "topic_title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "actor_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "notification_outbox" AS n
SET "topic_title" = t."title",
    "actor_name" = COALESCE((
      SELECT m."name"
      FROM "activity" AS a
      JOIN "members" AS m ON m."id" = a."actor_id"
      WHERE a."topic_id" = n."topic_id"
        AND a."created_at" <= n."created_at"
      ORDER BY a."created_at" DESC
      LIMIT 1
    ), 'QueueCraft user')
FROM "topics" AS t
WHERE t."id" = n."topic_id";
--> statement-breakpoint
UPDATE "notification_outbox" SET "actor_name" = 'QueueCraft user' WHERE "actor_name" = '';
--> statement-breakpoint
UPDATE "notification_outbox"
SET "action" = 'security.break_glass_alert'
WHERE "subject" LIKE 'QueueCraft break-glass validation:%';