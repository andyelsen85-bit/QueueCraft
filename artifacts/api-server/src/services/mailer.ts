import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { db, notificationOutboxTable } from "@workspace/db";
import { and, eq, inArray, lte } from "drizzle-orm";
import { config, smtpConfigured } from "../config";
import { logger } from "../lib/logger";

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth:
        config.smtp.user && config.smtp.password
          ? { user: config.smtp.user, pass: config.smtp.password }
          : undefined,
      tls: { rejectUnauthorized: true },
    })
  : null;

export async function queueMail(executor: any, input: {
  topicId?: string;
  recipient: string;
  subject: string;
  body: string;
}) {
  const id = randomUUID();
  await executor.insert(notificationOutboxTable).values({
    id,
    topicId: input.topicId,
    recipient: input.recipient,
    subject: input.subject,
    body: input.body,
  });
  return id;
}

export async function deliverPendingNotifications() {
  if (!transporter) {
    if (config.production) logger.error("SMTP is unavailable; notification delivery is blocked");
    return;
  }
  const pending = await db
    .select()
    .from(notificationOutboxTable)
    .where(
      and(
        inArray(notificationOutboxTable.status, ["pending", "failed"]),
        lte(notificationOutboxTable.nextAttemptAt, new Date()),
      ),
    )
    .limit(25);

  for (const item of pending) {
    try {
      await transporter.sendMail({
        from: config.smtp.from,
        to: item.recipient,
        subject: item.subject,
        text: item.body,
      });
      await db
        .update(notificationOutboxTable)
        .set({
          status: "sent",
          sentAt: new Date(),
          error: null,
          attempts: item.attempts + 1,
        })
        .where(eq(notificationOutboxTable.id, item.id));
    } catch (error) {
      const attempts = item.attempts + 1;
      const delayMinutes = Math.min(60, 2 ** Math.min(attempts, 6));
      await db
        .update(notificationOutboxTable)
        .set({
          status: "failed",
          attempts,
          nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
          error: error instanceof Error ? error.message.slice(0, 1000) : "SMTP delivery failed",
        })
        .where(eq(notificationOutboxTable.id, item.id));
      logger.error({ err: error, notificationId: item.id, attempts }, "SMTP delivery failed");
    }
  }
}