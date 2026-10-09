import assert from "node:assert/strict";
import { createServer, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

// Never run a database-mutating regression against the app database.
const database = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["127.0.0.1", "localhost"].includes(database.hostname));
assert.equal(database.pathname, "/queuecraft_mailer_regression");

let releaseSmtp!: () => void;
const smtpGate = new Promise<void>(resolve => { releaseSmtp = resolve; });
let signalMailStarted!: () => void;
const mailStarted = new Promise<void>(resolve => { signalMailStarted = resolve; });
const sockets = new Set<Socket>();
let deliveries = 0;
const messages: string[] = [];
const server = createServer(socket => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
  socket.write("220 fictional.local ESMTP\r\n");
  let buffer = "";
  let inData = false;
  let message: string[] = [];
  socket.on("data", chunk => {
    buffer += chunk.toString();
    let end: number;
    while ((end = buffer.indexOf("\r\n")) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (inData) {
        if (line !== ".") {
          message.push(line);
          continue;
        }
        inData = false;
        messages.push(message.join("\n"));
        deliveries++;
        signalMailStarted();
        void smtpGate.then(() => socket.write("250 Accepted\r\n"));
      } else if (/^(EHLO|HELO)/.test(line)) socket.write("250 fictional.local\r\n");
      else if (/^(MAIL FROM|RCPT TO|RSET)/.test(line)) socket.write("250 OK\r\n");
      else if (line === "DATA") {
        inData = true;
        message = [];
        socket.write("354 End with dot\r\n");
      } else if (line === "QUIT") socket.end("221 Bye\r\n");
    }
  });
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address !== "string");
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = String(address.port);
process.env.SMTP_SECURE = "false";
process.env.SMTP_FROM = "queuecraft@example.invalid";
delete process.env.SMTP_USER;
delete process.env.SMTP_PASSWORD;

const { db, pool, notificationOutboxTable } = await import("@workspace/db");
const { deliverPendingNotifications } = await import("../src/services/mailer");
const id = randomUUID();
const recipient = "fictional.member@example.invalid";
let delivery: Promise<void> | undefined;
try {
  await db.insert(notificationOutboxTable).values({
    id, recipient, action: "topic.updated", subject: "Fictional change",
    body: "A fictional topic was updated", nextAttemptAt: new Date(0),
  });
  delivery = deliverPendingNotifications();
  await Promise.race([
    mailStarted,
    new Promise((_, reject) => setTimeout(() => reject(new Error("SMTP did not start")), 5000).unref()),
  ]);
  // The OLD worker held this recipient lock throughout SMTP. This now must
  // finish while SMTP is deliberately still waiting for a response.
  await db.transaction(async tx => {
    await tx.execute(sql`SET LOCAL lock_timeout = '500ms'`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(lower(${recipient})), 731904221)`);
    await tx.execute(sql`SELECT 1`);
  });
  const anotherPod = await pool.connect();
  try {
    const result = await anotherPod.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(731904221) AS locked",
    );
    if (result.rows[0]?.locked) await anotherPod.query("SELECT pg_advisory_unlock(731904221)");
    assert.equal(result.rows[0]?.locked, false, "Another pod must not send the same mail");
  } finally {
    anotherPod.release();
  }
  await deliverPendingNotifications();
  assert.equal(deliveries, 1, "Overlapping timer passes must not duplicate the send");
  const urgentId = randomUUID();
  const digestId = randomUUID();
  await db.insert(notificationOutboxTable).values([
    {
      id: urgentId, recipient: "fictional.security@example.invalid",
      action: "security.break_glass_alert", subject: "Fictional urgent break-glass alert",
      body: "Fictional security event", nextAttemptAt: new Date(0),
    },
    {
      id: digestId, recipient, action: "topic.updated", subject: "Another fictional change",
      body: "Another fictional update", nextAttemptAt: new Date(0),
    },
  ]);
  releaseSmtp();
  await delivery;
  const result = await db.execute(sql`SELECT status FROM notification_outbox WHERE id = ${id}`);
  assert.equal(result.rows[0]?.status, "sent");
  await deliverPendingNotifications();
  assert.equal(deliveries, 3);
  assert.match(messages[1], /Subject: Fictional urgent break-glass alert/);
  assert.match(messages[2], /Subject: QueueCraft topic changes \(1\)/);
  const unlockedClient = await pool.connect();
  try {
    const unlocked = await unlockedClient.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(731904221) AS locked",
    );
    assert.equal(unlocked.rows[0]?.locked, true, "The completed worker must release its lock");
    await unlockedClient.query("SELECT pg_advisory_unlock(731904221)");
  } finally {
    unlockedClient.release();
  }
  console.log("PASS: recipient locks remain available during stalled SMTP; duplicate protection, lock release and urgent-first delivery preserved.");
} finally {
  releaseSmtp();
  await delivery;
  for (const socket of sockets) socket.destroy();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await pool.end();
}
