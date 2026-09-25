import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import request from "supertest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as queuecraftSchema from "@workspace/db/schema";
import {
  activityTable,
  auditLogTable,
  collaboratorMilestonesTable,
  db,
  departmentsTable,
  membersTable,
  milestonesTable,
  notificationOutboxTable,
  notificationSettingsTable,
  pool,
  rolesTable,
  topicFinishDateRevisionsTable,
  topicAllocationsTable,
  topicCollaboratorsTable,
  topicsTable,
} from "@workspace/db";
import app from "./app";
import { getCapabilities } from "./routes/queuecraft";
import {
  BACKUP_FINGERPRINT,
  BACKUP_FORMAT,
  BACKUP_MANIFEST,
  BACKUP_TABLES,
  BACKUP_VERSION,
  validateBackup,
} from "./services/backup";
import { exportBackup, restoreBackup } from "./services/backup";
import { resolveEncryptionKey } from "./config";
import { groupNotificationsByRecipient, queueMail, renderNotificationDigest } from "./services/mailer";
import {
  decryptRuntimeSettings,
  encryptRuntimeSettings,
} from "./services/application-settings";
import { serializeOidcRequestBody } from "./services/oidc";
import {
  collectTopicNotificationMemberIds,
  BREAK_GLASS_NOTIFICATION_ACTION,
  notificationAction,
} from "./services/notifications";

before(async () => {
  if (!process.env.CI) return;
  await db
    .insert(membersTable)
    .values({
      id: "member-andy",
      name: "Andy Elsen",
      initials: "AE",
      email: "andy.elsen@example.invalid",
      title: "Service Head",
    })
    .onConflictDoNothing();
  await db
    .insert(departmentsTable)
    .values({
      id: "dept-platform",
      name: "Platform Services",
      serviceHeadId: "member-andy",
    })
    .onConflictDoNothing();
  await db
    .update(departmentsTable)
    .set({ serviceHeadId: "member-andy" })
    .where(eq(departmentsTable.id, "dept-platform"));
  await db
    .insert(rolesTable)
    .values({
      id: "role-ci-validation",
      name: "CI Validation",
      departmentId: "dept-platform",
      leadId: "member-andy",
    })
    .onConflictDoNothing();
});

after(async () => {
  await pool.end();
});

describe("QueueCraft security and preference flows", () => {
  test("local admin and delegated authorities can manage permissions and Settings", () => {
    const snapshot = {
      memberById: new Map([
        ["local-admin", { isCio: true }],
        ["head", { isCio: false }],
        ["deputy", { isCio: false }],
        ["cio", { isCio: true }],
      ]),
      departments: [{ serviceHeadId: "head", serviceHeadDeputyId: "deputy" }],
      roles: [],
    } as unknown as Parameters<typeof getCapabilities>[1];
    const admin = getCapabilities("local-admin", snapshot, "local");
    assert.ok(admin.includes("settings.manage"));
    assert.ok(admin.includes("directory.manage"));
    assert.ok(admin.includes("local_password.reset"));
    assert.ok(admin.includes("topic.delete"));
    assert.ok(!getCapabilities("local-admin", snapshot, "development").includes("local_password.reset"));
    for (const id of ["head", "deputy", "cio"]) {
      const capabilities = getCapabilities(id, snapshot, "ldaps");
      assert.ok(capabilities.includes("directory.manage"));
      assert.ok(capabilities.includes("directory.manage_cio"));
      assert.ok(capabilities.includes("settings.manage"));
      assert.equal(capabilities.includes("topic.delete"), id !== "cio");
      assert.ok(!capabilities.includes("local_password.reset"));
    }
    const ordinary = getCapabilities("ordinary", snapshot, "ldaps");
    assert.ok(!ordinary.includes("settings.manage"));
    assert.ok(!ordinary.includes("directory.manage"));
    assert.ok(!ordinary.includes("topic.delete"));
  });
  test("local member can change password and other sessions are revoked", async () => {
    const manager = request.agent(app);
    await manager.get("/api/session").expect(200);
    const csrf = await manager.get("/api/auth/csrf").expect(200);
    const email = `local-${randomUUID()}@example.invalid`;
    const original = `Initial-${randomUUID()}`;
    const replacement = `Changed-${randomUUID()}`;
    const created = await manager.post("/api/directory/members")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({ name: "Temporary local member", email, password: original })
      .expect(201);
    try {
      assert.equal(created.body.authProvider, "local");
      const local = request.agent(app);
      const other = request.agent(app);
      await local.post("/api/auth/local").send({ username: email, password: original }).expect(200);
      await other.post("/api/auth/local").send({ username: email, password: original }).expect(200);
      const localCsrf = await local.get("/api/auth/csrf").expect(200);
      await local.patch("/api/auth/password")
        .set("x-csrf-token", localCsrf.body.csrfToken)
        .send({ oldPassword: "incorrect", newPassword: replacement }).expect(400);
      await local.patch("/api/auth/password")
        .set("x-csrf-token", localCsrf.body.csrfToken)
        .send({ oldPassword: original, newPassword: replacement }).expect(200);
      assert.equal((await local.get("/api/session").expect(200)).body.user.id, created.body.id);
      const staleSession = await other.get("/api/session");
      assert.notEqual(staleSession.body.user?.id, created.body.id);
      await request(app).post("/api/auth/local")
        .send({ username: email, password: original }).expect(401);
      await request(app).post("/api/auth/local")
        .send({ username: email, password: replacement }).expect(200);
    } finally {
      await db.execute(sql`DELETE FROM user_sessions WHERE sess ->> 'userId' = ${created.body.id}`);
      await db.delete(membersTable).where(eq(membersTable.id, created.body.id));
    }
  });
  test("member authority assignments save together and grant Settings without backup access", async () => {
    const manager = request.agent(app);
    await manager.get("/api/session").expect(200);
    const csrf = await manager.get("/api/auth/csrf").expect(200);
    const departmentId = `temp-${randomUUID()}`;
    const email = `authority-${randomUUID()}@example.invalid`;
    const password = `Initial-${randomUUID()}`;
    let memberId: string | undefined;
    try {
      await db.insert(departmentsTable).values({
        id: departmentId, name: `Temporary department ${departmentId}`, serviceHeadId: "member-andy",
      });
      const created = await manager.post("/api/directory/members")
        .set("x-csrf-token", csrf.body.csrfToken)
        .send({ name: "Temporary authority", email, password })
        .expect(201);
      memberId = created.body.id;
      await manager.patch(`/api/directory/members/${memberId}`)
        .set("x-csrf-token", csrf.body.csrfToken)
        .send({
          title: "Authority",
          isCio: true,
          headDepartmentIds: [departmentId],
          deputyDepartmentIds: [],
        })
        .expect(200);
      const [department] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, departmentId));
      assert.equal(department.serviceHeadId, memberId);
      await manager.patch(`/api/directory/members/${memberId}`)
        .set("x-csrf-token", csrf.body.csrfToken)
        .send({ title: "Should not save", headDepartmentIds: ["not-a-department"], deputyDepartmentIds: [] })
        .expect(400);
      const [member] = await db.select().from(membersTable).where(eq(membersTable.id, created.body.id));
      assert.equal(member.title, "Authority");
      const delegated = request.agent(app);
      await delegated.post("/api/auth/local").send({ username: email, password }).expect(200);
      const session = await delegated.get("/api/session").expect(200);
      for (const capability of ["directory.manage", "settings.manage", "directory.manage_cio"])
        assert.ok(session.body.capabilities.includes(capability));
      await delegated.get("/api/admin/settings").expect(200);
      await delegated.get("/api/admin/backup").expect(403);
    } finally {
      await db.delete(departmentsTable).where(eq(departmentsTable.id, departmentId));
      if (memberId) {
        await db.execute(sql`DELETE FROM user_sessions WHERE sess ->> 'userId' = ${memberId}`);
        await db.delete(membersTable).where(eq(membersTable.id, memberId));
      }
    }
  });
  test("backup registry covers every QueueCraft schema table", () => {
    const schemaTables = Object.values(queuecraftSchema).flatMap((value) => {
      try {
        return [
          getTableConfig(value as Parameters<typeof getTableConfig>[0]).name,
        ];
      } catch {
        return [];
      }
    });
    const backupTables = BACKUP_TABLES.map(([name]) => name);
    assert.deepEqual(new Set(backupTables), new Set(schemaTables));
    assert.equal(backupTables.length, schemaTables.length);
  });

  test("rejects backups with missing or unknown tables", () => {
    assert.throws(
      () =>
        validateBackup({
          format: BACKUP_FORMAT,
          version: BACKUP_VERSION,
          manifest: BACKUP_MANIFEST,
          fingerprint: BACKUP_FINGERPRINT,
          tables: {},
        }),
      /table coverage/,
    );
  });

  test("restores a JSON round-trip while preserving newer immutable audit history", async () => {
    const originalId = randomUUID();
    const newerId = randomUUID();
    await db.insert(auditLogTable).values({
      id: originalId,
      actorId: "member-andy",
      action: "Round-trip fixture",
      resourceType: "system",
      details: {},
    });
    const exported = await exportBackup();
    const parsed = JSON.parse(JSON.stringify(exported));
    const createdAt = (parsed.tables.audit_log[0] as { createdAt: string })
      .createdAt;
    assert.equal(typeof createdAt, "string");
    const collisionId = randomUUID();
    const recoveryAdminId = randomUUID();
    const restoreAuditId = randomUUID();
    const restoredEmail = `restored-${randomUUID()}@example.invalid`;
    const restoredSubject = `subject-${randomUUID()}`;
    const restoredMember = (
      parsed.tables.members as Array<Record<string, unknown>>
    ).find((row) => row.id === "member-andy");
    assert.ok(restoredMember);
    restoredMember.email = restoredEmail;
    restoredMember.externalSubject = restoredSubject;
    await db.insert(membersTable).values({
      id: collisionId,
      name: "Retained audit actor",
      initials: "RA",
      email: restoredEmail,
      externalSubject: restoredSubject,
      status: "active",
      isCio: true,
    });
    await db.insert(membersTable).values({
      id: recoveryAdminId,
      name: "Recovery administrator",
      initials: "RA",
      email: `recovery-${recoveryAdminId}@example.invalid`,
      status: "active",
      isCio: true,
    });
    await db.insert(auditLogTable).values({
      id: newerId,
      actorId: collisionId,
      action: "Newer immutable history",
      resourceType: "system",
      details: {},
    });
    await db.execute(sql`
      INSERT INTO user_sessions (sid, sess, expire)
      VALUES (
        ${`restore-test-${collisionId}`},
        ${JSON.stringify({ userId: collisionId })},
        NOW() + INTERVAL '1 hour'
      )
    `);
    await restoreBackup(parsed, {
      id: restoreAuditId,
      actorId: recoveryAdminId,
      action: "Backup restored",
      resourceType: "system",
      details: { format: "queuecraft-json", version: 2 },
    });
    const preserved = await db
      .select()
      .from(auditLogTable)
      .where(eq(auditLogTable.id, newerId));
    assert.equal(preserved.length, 1);
    assert.ok(preserved[0].createdAt instanceof Date);
    const [restoredAndy] = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.id, "member-andy"));
    assert.equal(restoredAndy.email, restoredEmail);
    assert.equal(restoredAndy.externalSubject, restoredSubject);
    const [retainedActor] = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.id, collisionId));
    assert.equal(retainedActor.status, "disabled");
    assert.match(retainedActor.email, /^restored-archive-/);
    const [recoveryAdmin] = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.id, recoveryAdminId));
    assert.equal(recoveryAdmin.status, "disabled");
    const restoreAudit = await db
      .select()
      .from(auditLogTable)
      .where(eq(auditLogTable.id, restoreAuditId));
    assert.equal(restoreAudit.length, 1);
    const sessions = await db.execute(sql`SELECT sid FROM user_sessions`);
    assert.equal(sessions.rows.length, 0);
  });

  test("requires an independent 32-byte application encryption key in production", () => {
    const sessionSecret = "ab".repeat(32);
    assert.throws(
      () => resolveEncryptionKey(undefined, sessionSecret, true),
      /required in production/,
    );
    assert.throws(
      () => resolveEncryptionKey("short", sessionSecret, true),
      /exactly 32 random bytes/,
    );
    assert.throws(
      () => resolveEncryptionKey(sessionSecret, sessionSecret, true),
      /independent/,
    );
    assert.equal(
      resolveEncryptionKey("cd".repeat(32), sessionSecret, true).length,
      32,
    );
  });

  test("round-trips runtime settings with the versioned independent key", () => {
    const settings = {
      adfsClientSecret: "adfs-secret",
      ldapsBindPassword: "ldap-secret",
      smtpPassword: "smtp-secret",
    };
    const encrypted = encryptRuntimeSettings(settings);
    assert.match(encrypted, /^v2\./);
    assert.deepEqual(decryptRuntimeSettings(encrypted), {
      settings,
      migrated: false,
    });
  });

  test("serializes the form-encoded OIDC token request body", () => {
    assert.equal(
      serializeOidcRequestBody(new URLSearchParams({ code: "abc", grant_type: "authorization_code" })),
      "code=abc&grant_type=authorization_code",
    );
  });

  test("includes topic role members and role and department authorities once", () => {
    assert.deepEqual(
      collectTopicNotificationMemberIds(
        [{ leadId: "role-lead", deputyId: "shared-deputy" }],
        [{ serviceHeadId: "department-lead", serviceHeadDeputyId: "shared-deputy" }],
        [{ memberId: "member-a" }, { memberId: "role-lead" }],
      ),
      ["role-lead", "shared-deputy", "department-lead", "member-a"],
    );
  });

  test("notification rules can independently select recipient permission groups", () => {
    assert.deepEqual(
      collectTopicNotificationMemberIds(
        [{ leadId: "role-lead", deputyId: "role-deputy" }],
        [{ serviceHeadId: "service-head", serviceHeadDeputyId: "service-deputy" }],
        [{ memberId: "role-member" }],
        ["affected_role_members", "head_of_service"],
      ),
      ["service-head", "role-member"],
    );
    assert.deepEqual(
      collectTopicNotificationMemberIds(
        [{ leadId: "role-lead", deputyId: "role-deputy" }],
        [],
        [],
        ["deputy_of_affected_role"],
      ),
      ["role-deputy"],
    );
  });

  test("notification settings, recipient groups, and cache controls keep urgent alerts intact", async () => {
    const agent = request.agent(app);
    await agent.get("/api/session").expect(200);
    const csrf = (await agent.get("/api/auth/csrf").expect(200)).body.csrfToken;
    const previous = (await agent.get("/api/admin/notification-settings").expect(200)).body.frequencyMinutes;
    const ruleId = randomUUID();
    const digestId = randomUUID();
    const urgentId = randomUUID();
    try {
      await agent.put("/api/admin/notification-settings")
        .set("x-csrf-token", csrf).send({ frequencyMinutes: 0 }).expect(400);
      await agent.put("/api/admin/notification-settings")
        .set("x-csrf-token", csrf).send({ frequencyMinutes: 7 }).expect(200);
      assert.equal((await agent.get("/api/admin/notification-settings").expect(200)).body.frequencyMinutes, 7);
      await agent.put(`/api/admin/notification-rules/${ruleId}`)
        .set("x-csrf-token", csrf)
        .send({ action: "topic.created", enabled: true, recipientGroups: ["head_of_service"] })
        .expect(200);
      const rules = (await agent.get("/api/admin/notification-rules").expect(200)).body;
      assert.deepEqual(rules.find((rule: { id: string }) => rule.id === ruleId).recipientGroups, ["head_of_service"]);
      await db.insert(notificationOutboxTable).values([
        { id: digestId, recipient: "digest@example.invalid", subject: "Topic created", body: "A change", action: "topic.created" },
        { id: urgentId, recipient: "urgent@example.invalid", subject: "Break-glass", body: "Urgent", action: BREAK_GLASS_NOTIFICATION_ACTION },
      ]);
      const status = (await agent.get("/api/admin/notification-settings").expect(200)).body;
      assert.equal(status.queuedItems, 1);
      assert.equal(status.recipients, 1);
      assert.equal((await agent.delete("/api/admin/notification-cache")
        .set("x-csrf-token", csrf).expect(200)).body.deletedItems, 1);
      assert.equal((await db.select().from(notificationOutboxTable).where(eq(notificationOutboxTable.id, digestId))).length, 0);
      assert.equal((await db.select().from(notificationOutboxTable).where(eq(notificationOutboxTable.id, urgentId))).length, 1);
    } finally {
      await agent.delete(`/api/admin/notification-rules/${ruleId}`).set("x-csrf-token", csrf);
      await db.delete(notificationOutboxTable).where(inArray(notificationOutboxTable.id, [digestId, urgentId]));
      if (previous === 5) {
        await db.delete(notificationSettingsTable).where(eq(notificationSettingsTable.id, "default"));
      } else {
        await agent.put("/api/admin/notification-settings")
          .set("x-csrf-token", csrf).send({ frequencyMinutes: previous }).expect(200);
      }
    }
  });

  test("accepts the immediately previous notification backup schema", () => {
    const previousManifest = BACKUP_MANIFEST
      .filter((entry) => entry.name !== "notification_settings" && entry.name !== "milestone_allocations")
      .map((entry) => ({
        ...entry,
        columns: entry.columns.filter((column) =>
          !(entry.name === "notification_outbox" && ["action", "topicTitle", "actorName"].includes(column.key))
          && !(entry.name === "notification_rules" && column.key === "recipientGroups")
          && !(entry.name === "topics" && column.key === "dependsOnTopicId"),
        ),
      }));
    const tables = Object.fromEntries(previousManifest.map(({ name }) => [
      name,
      name === "notification_outbox"
        ? [{ id: "legacy-security", topicId: "topic", recipient: "authority@example.invalid", subject: "QueueCraft break-glass validation: Critical", body: "Alert" }]
        : [],
    ]));
    const legacy = validateBackup({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      manifest: previousManifest,
      fingerprint: createHash("sha256").update(JSON.stringify(previousManifest)).digest("hex"),
      tables,
    });
    assert.deepEqual(legacy.tables.notification_settings, []);
    assert.equal((legacy.tables.notification_outbox[0] as { action: string }).action, BREAK_GLASS_NOTIFICATION_ACTION);
    assert.equal(legacy.manifest, BACKUP_MANIFEST);
  });

  test("accepts backups made before topic dependencies", () => {
    const oldManifest = BACKUP_MANIFEST.map((entry) => ({
      ...entry,
      columns: entry.columns.filter((column) =>
        !(entry.name === "topics" && column.key === "dependsOnTopicId")),
    }));
    const restored = validateBackup({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      manifest: oldManifest,
      fingerprint: createHash("sha256").update(JSON.stringify(oldManifest)).digest("hex"),
      tables: Object.fromEntries(oldManifest.map(({ name }) => [
        name, name === "topics" ? [{ id: "legacy-topic", title: "Old topic" }] : [],
      ])),
    });
    assert.equal((restored.tables.topics[0] as { dependsOnTopicId: string | null }).dependsOnTopicId, null);
  });

  test("maps topic allocation changes to their notification action", () => {
    assert.equal(notificationAction("Topic allocations replaced"), "topic.allocations_replaced");
  });

  test("notification digest escapes HTML and includes topic, actor, and changed values", () => {
    const item = {
      id: "notification",
      topicId: "topic",
      recipient: "a@example.invalid",
      action: "topic.updated",
      topicTitle: "<img src=x onerror=alert(1)>",
      actorName: "Sam <script>alert(1)</script>",
      subject: "QueueCraft: Topic updated",
      body: "Title: old → <b>new</b>",
      status: "pending",
      error: null,
      attempts: 0,
      nextAttemptAt: new Date("2025-01-01T00:00:00.000Z"),
      sentAt: null,
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
    } as Parameters<typeof renderNotificationDigest>[0][number];
    const html = renderNotificationDigest([item]);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html, /Sam &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /&lt;b&gt;new&lt;\/b&gt;/);
    assert.doesNotMatch(html, /<script>|<img src=x/);
  });

  test("groups a recipient's changes case-insensitively into one digest batch", () => {
    const base = {
      id: "notification",
      topicId: "topic",
      subject: "QueueCraft: Topic updated",
      action: "topic.updated",
      topicTitle: "Example topic",
      actorName: "Actor",
      body: "Change",
      status: "pending" as const,
      error: null,
      attempts: 0,
      nextAttemptAt: new Date(),
      sentAt: null,
      createdAt: new Date(),
    };
    const groups = groupNotificationsByRecipient([
      { ...base, id: "one", recipient: "Member@example.invalid" },
      { ...base, id: "two", recipient: "member@EXAMPLE.invalid" },
      { ...base, id: "three", recipient: "other@example.invalid" },
    ]);
    assert.equal(groups.size, 2);
    assert.equal(groups.get("member@example.invalid")?.length, 2);
  });

  test("queueMail classifies break-glass alerts as immediate security messages", async () => {
    let queued: Record<string, unknown> | undefined;
    const executor = {
      insert: () => ({
        values: async (value: Record<string, unknown>) => { queued = value; },
      }),
    };
    const start = Date.now();
    await queueMail(executor, {
      topicId: "topic",
      recipient: "authority@example.invalid",
      subject: "QueueCraft break-glass validation: Critical topic",
      body: "Original alert details",
    });
    assert.equal(queued?.action, BREAK_GLASS_NOTIFICATION_ACTION);
    assert.equal(queued?.subject, "QueueCraft break-glass validation: Critical topic");
    assert.equal(queued?.body, "Original alert details");
    assert.ok((queued?.nextAttemptAt as Date).getTime() <= start + 1_000);
  });

  test("rejects a state-changing request without a CSRF token", async () => {
    const agent = request.agent(app);
    await agent.get("/api/session").expect(200);
    await agent
      .patch("/api/preferences/topic-filters")
      .send({ departmentId: null, status: null, priority: null })
      .expect(403);
  });

  test("service authorities can manage Directory and Settings", async () => {
    if (!process.env.CI) return;
    const agent = request.agent(app);
    const session = await agent.get("/api/session").expect(200);
    assert.ok(session.body.capabilities.includes("directory.manage"));
    assert.ok(session.body.capabilities.includes("settings.manage"));
    await agent.get("/api/admin/settings").expect(200);
    await agent.get("/api/admin/settings/https").expect(200);
  });

  test("persists topic filters in the authenticated member record", async () => {
    const agent = request.agent(app);
    await agent.get("/api/session").expect(200);
    const csrf = await agent.get("/api/auth/csrf").expect(200);
    assert.equal(typeof csrf.body.csrfToken, "string");

    await agent
      .patch("/api/preferences/topic-filters")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({ departmentId: "dept-platform", status: "open", priority: "P2" })
      .expect(200)
      .expect(({ body }) => {
        assert.deepEqual(body, {
          departmentId: "dept-platform",
          roleId: null,
          status: "open",
          priority: "P2",
        });
      });

    await agent
      .get("/api/preferences/topic-filters")
      .expect(200)
      .expect(({ body }) => assert.equal(body.departmentId, "dept-platform"));

    await agent
      .patch("/api/preferences/topic-filters")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({ departmentId: null, status: null, priority: null })
      .expect(200);
  });

  test("allows a service authority to create a directory member", async () => {
    const agent = request.agent(app);
    await agent.get("/api/session").expect(200);
    const csrf = await agent.get("/api/auth/csrf").expect(200);
    const unique = randomUUID();
    const email = `test-${unique}@example.invalid`;
    const response = await agent
      .post("/api/directory/members")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({ name: "Test Member", email, title: "Temporary test identity" })
      .expect(201);

    assert.equal(response.body.email, email);
    assert.equal(response.body.status, "active");
    await db.delete(membersTable).where(eq(membersTable.id, response.body.id));
  });

  test("supports named BAU tasks, legacy scalar writes, and occupancy responses", async () => {
    const agent = request.agent(app);
    await agent.get("/api/session").expect(200);
    const csrf = await agent.get("/api/auth/csrf").expect(200);
    const created = await agent
      .post("/api/directory/members")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({
        name: "BAU Tasks Member",
        email: `bau-${randomUUID()}@example.invalid`,
        dailyBusinessTasks: [
          { name: "  Customer support  ", percent: 20 },
          { name: "Reporting", percent: 15 },
        ],
      })
      .expect(201);
    const memberId = created.body.id as string;
    try {
      assert.deepEqual(created.body.dailyBusinessTasks, [
        { name: "Customer support", percent: 20 },
        { name: "Reporting", percent: 15 },
      ]);
      assert.equal(created.body.dailyBusinessPercent, 35);

      const unrelated = await agent
        .patch(`/api/directory/members/${memberId}`)
        .set("x-csrf-token", csrf.body.csrfToken)
        .send({ title: "Unrelated update" })
        .expect(200);
      assert.equal(unrelated.body.title, "Unrelated update");
      assert.deepEqual(unrelated.body.dailyBusinessTasks, created.body.dailyBusinessTasks);
      assert.equal(unrelated.body.dailyBusinessPercent, 35);

      const scalarOnly = await agent
        .patch(`/api/directory/members/${memberId}`)
        .set("x-csrf-token", csrf.body.csrfToken)
        .send({ dailyBusinessPercent: 12 })
        .expect(200);
      assert.deepEqual(scalarOnly.body.dailyBusinessTasks, [
        { name: "Standard Operations", percent: 12 },
      ]);
      assert.equal(scalarOnly.body.dailyBusinessPercent, 12);

      const cleared = await agent
        .patch(`/api/directory/members/${memberId}`)
        .set("x-csrf-token", csrf.body.csrfToken)
        .send({ dailyBusinessTasks: [] })
        .expect(200);
      assert.deepEqual(cleared.body.dailyBusinessTasks, []);
      assert.equal(cleared.body.dailyBusinessPercent, 0);

      await agent
        .patch(`/api/directory/members/${memberId}`)
        .set("x-csrf-token", csrf.body.csrfToken)
        .send({
          dailyBusinessTasks: [
            { name: "Delivery", percent: 30 },
            { name: " delivery ", percent: 10 },
          ],
        })
        .expect(400);
      await agent
        .patch(`/api/directory/members/${memberId}`)
        .set("x-csrf-token", csrf.body.csrfToken)
        .send({
          dailyBusinessTasks: [
            { name: "Delivery", percent: 60 },
            { name: "Support", percent: 41 },
          ],
        })
        .expect(400);

      const restored = await agent
        .patch(`/api/directory/members/${memberId}`)
        .set("x-csrf-token", csrf.body.csrfToken)
        .send({ dailyBusinessTasks: [{ name: "Delivery", percent: 25 }] })
        .expect(200);
      const occupancy = await agent
        .get("/api/occupancy/overview?startDate=2041-01-01&endDate=2041-01-07")
        .expect(200);
      const row = occupancy.body.find(
        (item: { member: { id: string } }) => item.member.id === memberId,
      );
      assert.ok(row);
      assert.deepEqual(row.dailyBusinessTasks, restored.body.dailyBusinessTasks);
      assert.deepEqual(row.member.dailyBusinessTasks, restored.body.dailyBusinessTasks);
      assert.equal(row.dailyBusinessPercent, 25);
    } finally {
      await db.delete(membersTable).where(eq(membersTable.id, memberId));
    }
  });

  test("reads legacy scalar BAU rows with synthetic Standard Operations tasks", async () => {
    const agent = request.agent(app);
    await agent.get("/api/session").expect(200);
    const csrf = await agent.get("/api/auth/csrf").expect(200);
    const memberId = `legacy-bau-${randomUUID()}`;
    const email = `${memberId}@example.invalid`;
    await db.insert(membersTable).values({
      id: memberId,
      name: "Legacy BAU Member",
      initials: "LB",
      email,
      dailyBusinessPercent: 27,
      dailyBusinessTasks: [],
    });
    try {
      const directory = await agent.get("/api/directory/members").expect(200);
      const listed = directory.body.find((member: { id: string }) => member.id === memberId);
      assert.deepEqual(listed.dailyBusinessTasks, [
        { name: "Standard Operations", percent: 27 },
      ]);

      const patched = await agent
        .patch(`/api/directory/members/${memberId}`)
        .set("x-csrf-token", csrf.body.csrfToken)
        .send({ title: "Legacy preserved" })
        .expect(200);
      assert.deepEqual(patched.body.dailyBusinessTasks, [
        { name: "Standard Operations", percent: 27 },
      ]);
      const stored = await db
        .select()
        .from(membersTable)
        .where(eq(membersTable.id, memberId));
      assert.deepEqual(stored[0].dailyBusinessTasks, [
        { name: "Standard Operations", percent: 27 },
      ]);

      const occupancy = await agent
        .get("/api/occupancy/overview?startDate=2041-01-01&endDate=2041-01-07")
        .expect(200);
      const row = occupancy.body.find(
        (item: { member: { id: string } }) => item.member.id === memberId,
      );
      assert.ok(row);
      assert.deepEqual(row.dailyBusinessTasks, [
        { name: "Standard Operations", percent: 27 },
      ]);
      assert.deepEqual(row.member.dailyBusinessTasks, row.dailyBusinessTasks);
    } finally {
      await db.delete(membersTable).where(eq(membersTable.id, memberId));
    }
  });

  test("allows service authorities to delegate CIO authority", async () => {
    const agent = request.agent(app);
    await agent.get("/api/session").expect(200);
    const csrf = await agent.get("/api/auth/csrf").expect(200);
    const unique = randomUUID();
    const created = await agent
      .post("/api/directory/members")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({
        name: "Editable Member",
        email: `editable-${unique}@example.invalid`,
      })
      .expect(201);
    await agent
      .patch(`/api/directory/members/${created.body.id}`)
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({ title: "Updated by service authority", isCio: false })
      .expect(200);
    await agent
      .patch(`/api/directory/members/${created.body.id}`)
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({ isCio: true })
      .expect(200);
    await agent
      .patch("/api/directory/departments/dept-platform")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({ name: "Platform Services" })
      .expect(200);
    await db.delete(membersTable).where(eq(membersTable.id, created.body.id));
  });

  test("only department leadership can delete topics before and after validation", async () => {
    const manager = request.agent(app);
    const session = await manager.get("/api/session").expect(200);
    const actorId = session.body.user.id as string;
    const csrf = (await manager.get("/api/auth/csrf").expect(200)).body.csrfToken;
    const departments = (await manager.get("/api/directory/departments").expect(200)).body;
    const roles = (await manager.get("/api/directory/roles").expect(200)).body;
    const department = departments.find(
      (item: { id: string; serviceHead: { id: string } }) =>
        item.serviceHead.id === actorId &&
        roles.some((role: { departmentId: string }) => role.departmentId === item.id),
    );
    assert.ok(department, "The test actor must head a department with a role");
    const role = roles.find((item: { departmentId: string }) => item.departmentId === department.id);
    const topicIds: string[] = [];
    const topicTitles = new Map<string, string>();
    let ordinaryId: string | undefined;
    try {
      const email = `delete-topic-${randomUUID()}@example.invalid`;
      const password = `Temporary-${randomUUID()}`;
      const ordinaryMember = await manager.post("/api/directory/members")
        .set("x-csrf-token", csrf)
        .send({ name: "Ordinary temporary member", email, password })
        .expect(201);
      ordinaryId = ordinaryMember.body.id;
      const ordinary = request.agent(app);
      await ordinary.post("/api/auth/local").send({ username: email, password }).expect(200);
      const ordinaryCsrf = (await ordinary.get("/api/auth/csrf").expect(200)).body.csrfToken;

      for (const validated of [false, true]) {
        const title = `Deletion test ${randomUUID()}`;
        const created = await manager.post("/api/topics")
          .set("x-csrf-token", csrf)
          .send({
            title,
            description: "Temporary topic for testing authorized deletion.",
            departmentId: department.id,
            roleId: role.id,
            priority: "P3",
          })
          .expect(201);
        const topicId = created.body.id as string;
        topicIds.push(topicId);
        topicTitles.set(topicId, title);

        if (!validated) {
          const collaboratorId = randomUUID();
          const milestoneId = randomUUID();
          await db.insert(topicCollaboratorsTable).values({
            id: collaboratorId, topicId, memberId: actorId,
          });
          await db.insert(milestonesTable).values({ id: milestoneId, topicId, title: "Temporary milestone" });
          await db.insert(collaboratorMilestonesTable).values({ collaboratorId, milestoneId });
          await db.insert(topicAllocationsTable).values({ topicId, memberId: actorId, allocationPercent: 25 });
          await db.insert(topicFinishDateRevisionsTable).values({
            id: randomUUID(), topicId, actorId, note: "Temporary scope change",
          });
          await db.insert(notificationOutboxTable).values({
            id: randomUUID(), topicId, recipient: "nobody@example.invalid",
            subject: "Temporary notification", body: "Do not send",
          });
        } else {
          await manager.post(`/api/topics/${topicId}/validate`)
            .set("x-csrf-token", csrf)
            .send({ note: "Authorized validation" })
            .expect(200);
        }

        await ordinary.delete(`/api/topics/${topicId}`)
          .set("x-csrf-token", ordinaryCsrf).expect(403);
        await manager.delete(`/api/topics/${topicId}`).expect(403);
        await manager.delete(`/api/topics/${topicId}`)
          .set("x-csrf-token", csrf).expect(204);
        await manager.get(`/api/topics/${topicId}`).expect(404);
        assert.equal((await db.select().from(activityTable).where(eq(activityTable.topicId, topicId))).length, 0);
        assert.equal((await db.select().from(notificationOutboxTable).where(eq(notificationOutboxTable.topicId, topicId))).length, 0);
        assert.equal((await db.select().from(milestonesTable).where(eq(milestonesTable.topicId, topicId))).length, 0);
        assert.equal((await db.select().from(topicAllocationsTable).where(eq(topicAllocationsTable.topicId, topicId))).length, 0);
        assert.ok((await db.select().from(auditLogTable).where(and(
          eq(auditLogTable.resourceId, topicId),
          eq(auditLogTable.action, "Topic deleted"),
        ))).length > 0);
      }
    } finally {
      for (const topicId of topicIds) {
        await db.transaction(async (tx) => {
          await tx.delete(collaboratorMilestonesTable).where(inArray(
            collaboratorMilestonesTable.milestoneId,
            tx.select({ id: milestonesTable.id }).from(milestonesTable).where(eq(milestonesTable.topicId, topicId)),
          ));
          await tx.delete(milestonesTable).where(eq(milestonesTable.topicId, topicId));
          await tx.delete(topicCollaboratorsTable).where(eq(topicCollaboratorsTable.topicId, topicId));
          await tx.delete(topicAllocationsTable).where(eq(topicAllocationsTable.topicId, topicId));
          await tx.delete(topicFinishDateRevisionsTable).where(eq(topicFinishDateRevisionsTable.topicId, topicId));
          await tx.delete(activityTable).where(eq(activityTable.topicId, topicId));
          await tx.delete(notificationOutboxTable).where(eq(notificationOutboxTable.topicId, topicId));
          await tx.delete(topicsTable).where(eq(topicsTable.id, topicId));
          await tx.delete(activityTable).where(and(
            eq(activityTable.action, "Topic deleted"),
            eq(activityTable.detail, `${topicTitles.get(topicId)} (${topicId})`),
          ));
        });
      }
      if (ordinaryId) {
        await db.execute(sql`DELETE FROM user_sessions WHERE sess ->> 'userId' = ${ordinaryId}`);
        await db.delete(membersTable).where(eq(membersTable.id, ordinaryId));
      }
    }
  });

  test("preserves historical topic allocations when owners and collaborators change", async () => {
    const manager = request.agent(app);
    const session = await manager.get("/api/session").expect(200);
    const actorId = session.body.user.id as string;
    const csrf = (await manager.get("/api/auth/csrf").expect(200)).body.csrfToken;
    const departments = (await manager.get("/api/directory/departments").expect(200)).body;
    const roles = (await manager.get("/api/directory/roles").expect(200)).body;
    const department = departments.find(
      (item: { id: string; serviceHead: { id: string } }) =>
        item.serviceHead.id === actorId &&
        roles.some((role: { departmentId: string }) => role.departmentId === item.id),
    );
    assert.ok(department);
    const role = roles.find((item: { departmentId: string }) => item.departmentId === department.id);
    const other = { id: randomUUID() };
    await db.insert(membersTable).values({
      id: other.id,
      name: "Assignment test member",
      initials: "AT",
      email: `assignment-${other.id}@example.invalid`,
    });
    let topicId: string | undefined;
    try {
      const created = await manager.post("/api/topics")
        .set("x-csrf-token", csrf)
        .send({
          title: `Assignment changes ${randomUUID()}`,
          description: "Temporary topic for editing existing assignments.",
          departmentId: department.id,
          roleId: role.id,
          priority: "P3",
          primaryAssigneeId: actorId,
          estimatedStartDate: "2030-01-01",
          estimatedFinishDate: "2030-01-31",
        })
        .expect(201);
      const id = created.body.id as string;
      topicId = id;
      const url = `/api/topics/${id}`;
      const assign = (memberId: string | null) =>
        manager.post(`${url}/assign`).set("x-csrf-token", csrf).send({ memberId });
      const getAllocations = async () =>
        (await manager.get(`${url}/allocations`).expect(200)).body as { member: { id: string }; allocationPercent: number }[];

      const pendingChange = await assign(other.id).expect(200);
      assert.equal(pendingChange.body.primaryAssignee.id, other.id);
      assert.equal(pendingChange.body.status, "pending_validation");
      assert.equal((await assign(null).expect(200)).body.primaryAssignee, null);
      await assign(actorId).expect(409);
      await manager.post(`${url}/validate`).set("x-csrf-token", csrf).send({}).expect(200);

      assert.equal((await assign(actorId).expect(200)).body.status, "in_progress");
      await db.insert(topicAllocationsTable).values({
        topicId: id, memberId: actorId, allocationPercent: 20,
      });
      await manager.put(`${url}/allocations`).set("x-csrf-token", csrf)
        .send({ allocations: [] }).expect(410);
      assert.equal((await assign(other.id).expect(200)).body.primaryAssignee.id, other.id);
      assert.equal((await getAllocations())[0].allocationPercent, 20);

      const milestoneId = randomUUID();
      await db.insert(milestonesTable).values({ id: milestoneId, topicId: id, title: "Temporary milestone" });
      const collaborator = await manager.post(`${url}/collaborators`)
        .set("x-csrf-token", csrf)
        .send({ memberId: actorId, milestoneIds: [milestoneId] })
        .expect(201);
      await db.insert(topicAllocationsTable).values({
        topicId: id, memberId: other.id, allocationPercent: 40,
      });
      await manager.delete(`${url}/collaborators/${collaborator.body.id}`)
        .set("x-csrf-token", csrf).expect(204);
      assert.equal((await getAllocations()).length, 2);
      assert.equal((await db.select().from(collaboratorMilestonesTable)
        .where(eq(collaboratorMilestonesTable.collaboratorId, collaborator.body.id))).length, 0);
      assert.equal((await assign(null).expect(200)).body.status, "open");
      assert.equal((await getAllocations()).length, 2);
    } finally {
      try {
        if (topicId) await manager.delete(`/api/topics/${topicId}`)
          .set("x-csrf-token", csrf).expect(204);
      } finally {
        await db.delete(membersTable).where(eq(membersTable.id, other.id));
      }
    }
  });

  test("cannot bypass or replay pending topic validation", async () => {
    const agent = request.agent(app);
    const session = await agent.get("/api/session").expect(200);
    const csrf = await agent.get("/api/auth/csrf").expect(200);
    const roles = await agent.get("/api/directory/roles").expect(200);
    const departments = await agent.get("/api/directory/departments").expect(200);
    const department = departments.body.find(
      (item: { id: string; serviceHead: { id: string } }) =>
        item.serviceHead.id === session.body.user.id &&
        roles.body.some((role: { departmentId: string }) => role.departmentId === item.id),
    );
    assert.ok(department, "The fixture needs a department led by the test actor with a role");
    const role = roles.body.find(
      (item: { departmentId: string }) => item.departmentId === department.id,
    );

    const created = await agent
      .post("/api/topics")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({
        title: `Validation policy ${randomUUID()}`,
        description:
          "Temporary topic used to verify the validation transition policy.",
        departmentId: department.id,
        roleId: role.id,
        priority: "P3",
      })
      .expect(201);

    await agent
      .patch(`/api/topics/${created.body.id}`)
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({ status: "open" })
      .expect(409);
    await agent
      .post(`/api/topics/${created.body.id}/assign`)
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({ memberId: "member-andy" })
      .expect(409);
    await agent
      .post(`/api/topics/${created.body.id}/validate`)
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({ note: "Authorized validation" })
      .expect(200);
    await agent
      .patch(`/api/topics/${created.body.id}`)
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({ status: "pending_validation" })
      .expect(409);
    await agent
      .post(`/api/topics/${created.body.id}/validate`)
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({ note: "Replay attempt" })
      .expect(409);

    await db
      .delete(activityTable)
      .where(eq(activityTable.topicId, created.body.id));
    await db.delete(topicsTable).where(eq(topicsTable.id, created.body.id));
  });

  test("requires a note for finish-date changes and allows milestone deletion", async () => {
    const agent = request.agent(app);
    await agent.get("/api/session").expect(200);
    const csrf = await agent.get("/api/auth/csrf").expect(200);
    const roles = await agent.get("/api/directory/roles").expect(200);
    const role = roles.body.find(
      (item: { departmentId: string }) => item.departmentId === "dept-platform",
    );
    assert.ok(role);
    const created = await agent
      .post("/api/topics")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({
        title: `Milestone lifecycle ${randomUUID()}`,
        description:
          "Temporary topic used to verify finish-date and milestone lifecycle.",
        departmentId: "dept-platform",
        roleId: role.id,
        priority: "P3",
      })
      .expect(201);

    await agent
      .patch(`/api/topics/${created.body.id}/finish-date`)
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({ targetDate: "2030-01-15" })
      .expect(400);
    await agent
      .patch(`/api/topics/${created.body.id}/finish-date`)
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({
        targetDate: "2030-01-15",
        note: "Scope clarified with the requester.",
      })
      .expect(200);

    const milestone = await agent
      .post(`/api/topics/${created.body.id}/milestones`)
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({
        title: "Temporary milestone",
        beginDate: "2030-01-01",
        targetDate: "2030-01-15",
      })
      .expect(201);
    await agent
      .delete(`/api/milestones/${milestone.body.id}`)
      .set("x-csrf-token", csrf.body.csrfToken)
      .expect(204);

    await db
      .delete(topicFinishDateRevisionsTable)
      .where(eq(topicFinishDateRevisionsTable.topicId, created.body.id));
    await db
      .delete(activityTable)
      .where(eq(activityTable.topicId, created.body.id));
    await db.delete(topicsTable).where(eq(topicsTable.id, created.body.id));
    assert.equal(
      (
        await db
          .select()
          .from(milestonesTable)
          .where(eq(milestonesTable.id, milestone.body.id))
      ).length,
      0,
    );
  });

  test("counts milestone occupancy by date without counting historical topic allocations", async () => {
    const agent = request.agent(app);
    await agent.get("/api/session").expect(200);
    const csrf = await agent.get("/api/auth/csrf").expect(200);
    const roles = await agent.get("/api/directory/roles").expect(200);
    const role = roles.body.find(
      (item: { departmentId: string }) => item.departmentId === "dept-platform",
    );
    assert.ok(role);
    const created = await agent
      .post("/api/topics")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({
        title: `Occupancy range ${randomUUID()}`,
        description: "Temporary topic used to verify range-based occupancy.",
        departmentId: "dept-platform",
        roleId: role.id,
        priority: "P3",
        primaryAssigneeId: "member-andy",
        estimatedStartDate: "2041-01-01",
        estimatedFinishDate: "2041-01-31",
      })
      .expect(201);
    await db.insert(topicAllocationsTable).values({
      topicId: created.body.id, memberId: "member-andy", allocationPercent: 20,
    });
    const milestone = await agent
      .post(`/api/topics/${created.body.id}/milestones`)
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({
        title: "Focused delivery",
        beginDate: "2041-01-08",
        targetDate: "2041-01-17",
        assigneeId: "member-andy",
        allocations: [{ memberId: "member-andy", allocationPercent: 15 }],
      })
      .expect(201);
    assert.equal(milestone.body.allocations[0].allocationPercent, 15);
    const pending = await agent
      .get("/api/occupancy/overview?startDate=2041-01-13&endDate=2041-01-19")
      .expect(200);
    const pendingRow = pending.body.find(
      (item: { member: { id: string } }) => item.member.id === "member-andy",
    );
    assert.equal(pendingRow.milestoneAllocationPercent, 0);
    assert.equal(pendingRow.totalOccupancyPercent, pendingRow.dailyBusinessPercent);
    assert.deepEqual(pendingRow.milestones, []);
    await agent.post(`/api/topics/${created.body.id}/validate`)
      .set("x-csrf-token", csrf.body.csrfToken).send({}).expect(200);
    const during = await agent
      .get("/api/occupancy/overview?startDate=2041-01-13&endDate=2041-01-19")
      .expect(200);
    const row = during.body.find(
      (item: { member: { id: string } }) => item.member.id === "member-andy",
    );
    assert.equal(row.topicAllocationPercent, 0);
    assert.equal(row.milestoneAllocationPercent, 11);
    assert.equal(row.totalOccupancyPercent, row.dailyBusinessPercent + 11);
    assert.deepEqual(row.topics, []);
    const outside = await agent
      .get("/api/occupancy/overview?startDate=2041-02-03&endDate=2041-02-09")
      .expect(200);
    const outsideRow = outside.body.find(
      (item: { member: { id: string } }) => item.member.id === "member-andy",
    );
    assert.equal(outsideRow.topicAllocationPercent, 0);
    assert.equal(outsideRow.milestoneAllocationPercent, 0);
    await db
      .delete(milestonesTable)
      .where(eq(milestonesTable.id, milestone.body.id));
    await db
      .delete(topicAllocationsTable)
      .where(eq(topicAllocationsTable.topicId, created.body.id));
    await db
      .delete(activityTable)
      .where(eq(activityTable.topicId, created.body.id));
    await db.delete(topicsTable).where(eq(topicsTable.id, created.body.id));
  });

  test("keeps legacy topic allocations for reference without counting them", async () => {
    const agent = request.agent(app);
    await agent.get("/api/session").expect(200);
    const csrf = await agent.get("/api/auth/csrf").expect(200);
    const roles = await agent.get("/api/directory/roles").expect(200);
    const role = roles.body.find(
      (item: { departmentId: string }) => item.departmentId === "dept-platform",
    );
    assert.ok(role);
    const created = await agent
      .post("/api/topics")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({
        title: `Legacy allocation ${randomUUID()}`,
        description: "Existing allocation with no estimated topic dates.",
        departmentId: "dept-platform",
        roleId: role.id,
        priority: "P3",
        primaryAssigneeId: "member-andy",
        targetDate: "2041-01-31",
      })
      .expect(201);
    try {
      await db.insert(topicAllocationsTable).values({
        topicId: created.body.id,
        memberId: "member-andy",
        allocationPercent: 35,
      });
      const during = await agent
        .get("/api/occupancy/overview?startDate=2041-01-13&endDate=2041-01-19")
        .expect(200);
      const row = during.body.find(
        (item: { member: { id: string } }) => item.member.id === "member-andy",
      );
      assert.equal((await agent.get(`/api/topics/${created.body.id}/allocations`).expect(200))
        .body[0].allocationPercent, 35);
      assert.deepEqual(row.topics, []);
      assert.equal(row.topicAllocationPercent, 0);
      const after = await agent
        .get("/api/occupancy/overview?startDate=2041-02-03&endDate=2041-02-09")
        .expect(200);
      const afterRow = after.body.find(
        (item: { member: { id: string } }) => item.member.id === "member-andy",
      );
      assert.equal(
        afterRow.topics.some((item: { topicId: string }) => item.topicId === created.body.id),
        false,
      );
    } finally {
      await db.delete(topicAllocationsTable).where(eq(topicAllocationsTable.topicId, created.body.id));
      await db.delete(activityTable).where(eq(activityTable.topicId, created.body.id));
      await db.delete(topicsTable).where(eq(topicsTable.id, created.body.id));
    }
  });

  test("allocates multiple collaborators independently on each milestone", async () => {
    const agent = request.agent(app);
    await agent.get("/api/session").expect(200);
    const csrf = (await agent.get("/api/auth/csrf").expect(200)).body.csrfToken;
    const otherId = randomUUID();
    const outsiderId = randomUUID();
    await db.insert(membersTable).values({
      id: otherId, name: "Milestone collaborator", initials: "MC",
      email: `milestone-${otherId}@example.invalid`,
    });
    await db.insert(membersTable).values({
      id: outsiderId, name: "Unrelated member", initials: "UM",
      email: `unrelated-${outsiderId}@example.invalid`,
    });
    let topicId: string | undefined;
    try {
      const created = await agent.post("/api/topics").set("x-csrf-token", csrf)
        .send({
          title: `Multiple milestones ${randomUUID()}`,
          description: "Temporary topic for per-person milestone occupancy.",
          departmentId: "dept-platform", roleId: "role-ci-validation",
          priority: "P3", primaryAssigneeId: "member-andy",
        }).expect(201);
      topicId = created.body.id;
      const path = `/api/topics/${topicId}`;
      const collaborator = await agent.post(`${path}/collaborators`).set("x-csrf-token", csrf)
        .send({ memberId: otherId }).expect(201);
      const first = await agent.post(`${path}/milestones`).set("x-csrf-token", csrf)
        .send({
          title: "First delivery", beginDate: "2042-02-01", targetDate: "2042-02-07",
          allocations: [
            { memberId: "member-andy", allocationPercent: 25 },
            { memberId: otherId, allocationPercent: 40 },
          ],
        }).expect(201);
      const second = await agent.post(`${path}/milestones`).set("x-csrf-token", csrf)
        .send({
          title: "Second delivery", beginDate: "2042-02-01", targetDate: "2042-02-07",
          allocations: [{ memberId: otherId, allocationPercent: 20 }],
        }).expect(201);
      assert.equal(first.body.allocations.length, 2);
      assert.equal(second.body.allocations.length, 1);
      const detail = await agent.get(path).expect(200);
      assert.equal(detail.body.milestones.find((m: { id: string }) => m.id === first.body.id).allocations.length, 2);
      const getOverview = async () => (await agent
        .get("/api/occupancy/overview?startDate=2042-02-01&endDate=2042-02-07")
        .expect(200)).body;
      const pending = await getOverview();
      assert.equal(pending.find((row: { member: { id: string } }) =>
        row.member.id === "member-andy").milestoneAllocationPercent, 0);
      assert.equal(pending.find((row: { member: { id: string } }) =>
        row.member.id === otherId).milestoneAllocationPercent, 0);
      await agent.post(`${path}/validate`).set("x-csrf-token", csrf).send({}).expect(200);
      const initial = await getOverview();
      assert.equal(initial.find((row: { member: { id: string } }) =>
        row.member.id === "member-andy").milestoneAllocationPercent, 25);
      assert.equal(initial.find((row: { member: { id: string } }) =>
        row.member.id === otherId).milestoneAllocationPercent, 60);
      await agent.post(`${path}/milestones`).set("x-csrf-token", csrf)
        .send({
          title: "Duplicate assignment", beginDate: "2042-02-01", targetDate: "2042-02-07",
          allocations: [
            { memberId: otherId, allocationPercent: 10 },
            { memberId: otherId, allocationPercent: 10 },
          ],
        }).expect(400);
      const unallocated = await agent.post(`${path}/milestones`).set("x-csrf-token", csrf)
        .send({
          title: "Unrelated assignee", beginDate: "2042-02-01", targetDate: "2042-02-07",
          assigneeId: outsiderId, allocations: [],
        }).expect(201);
      await agent.patch(`/api/milestones/${unallocated.body.id}`).set("x-csrf-token", csrf)
        .send({ allocations: [{ memberId: outsiderId, allocationPercent: 50 }] })
        .expect(400);
      await agent.delete(`${path}/collaborators/${collaborator.body.id}`)
        .set("x-csrf-token", csrf).expect(409);
      await agent.patch(`/api/milestones/${first.body.id}`).set("x-csrf-token", csrf)
        .send({ allocations: [{ memberId: "member-andy", allocationPercent: 30 }] })
        .expect(200);
      const changed = await getOverview();
      assert.equal(changed.find((row: { member: { id: string } }) =>
        row.member.id === "member-andy").milestoneAllocationPercent, 30);
      assert.equal(changed.find((row: { member: { id: string } }) =>
        row.member.id === otherId).milestoneAllocationPercent, 20);
      await agent.patch(`/api/milestones/${first.body.id}`).set("x-csrf-token", csrf)
        .send({ allocations: [] }).expect(200);
      await agent.patch(`/api/milestones/${second.body.id}`).set("x-csrf-token", csrf)
        .send({ allocations: [] }).expect(200);
      assert.equal((await getOverview()).find((row: { member: { id: string } }) =>
        row.member.id === otherId).milestoneAllocationPercent, 0);
      await agent.delete(`${path}/collaborators/${collaborator.body.id}`)
        .set("x-csrf-token", csrf).expect(204);
    } finally {
      try {
        if (topicId) await agent.delete(`/api/topics/${topicId}`)
          .set("x-csrf-token", csrf).expect(204);
      } finally {
        await db.delete(membersTable).where(eq(membersTable.id, otherId));
        await db.delete(membersTable).where(eq(membersTable.id, outsiderId));
      }
    }
  });

  test("preserves legacy single-assignee milestone occupancy until replaced", async () => {
    const agent = request.agent(app);
    await agent.get("/api/session").expect(200);
    const csrf = (await agent.get("/api/auth/csrf").expect(200)).body.csrfToken;
    const created = await agent.post("/api/topics").set("x-csrf-token", csrf)
      .send({
        title: `Legacy milestone ${randomUUID()}`,
        description: "Temporary topic for legacy milestone occupancy.",
        departmentId: "dept-platform", roleId: "role-ci-validation",
        priority: "P3", primaryAssigneeId: "member-andy",
      }).expect(201);
    try {
      const milestoneId = randomUUID();
      await db.insert(milestonesTable).values({
        id: milestoneId, topicId: created.body.id, title: "Older milestone",
        beginDate: "2042-02-01", targetDate: "2042-02-07",
        assigneeId: "member-andy", workloadPercent: 35,
      });
      const detail = await agent.get(`/api/topics/${created.body.id}`).expect(200);
      assert.equal(detail.body.milestones[0].allocations[0].allocationPercent, 35);
      const overviewPath = "/api/occupancy/overview?startDate=2042-02-01&endDate=2042-02-07";
      const pending = await agent.get(overviewPath).expect(200);
      assert.equal(pending.body.find((row: { member: { id: string } }) =>
        row.member.id === "member-andy").milestoneAllocationPercent, 0);
      await agent.post(`/api/topics/${created.body.id}/validate`)
        .set("x-csrf-token", csrf).send({}).expect(200);
      const initial = await agent.get(overviewPath).expect(200);
      assert.equal(initial.body.find((row: { member: { id: string } }) =>
        row.member.id === "member-andy").milestoneAllocationPercent, 35);
      await agent.patch(`/api/milestones/${milestoneId}`).set("x-csrf-token", csrf)
        .send({ assigneeId: null }).expect(409);
      assert.equal((await agent.get(`/api/topics/${created.body.id}`).expect(200))
        .body.milestones[0].allocations[0].member.id, "member-andy");
      await agent.patch(`/api/milestones/${milestoneId}`).set("x-csrf-token", csrf)
        .send({ allocations: [] }).expect(200);
      const cleared = await agent.get(overviewPath).expect(200);
      assert.equal(cleared.body.find((row: { member: { id: string } }) =>
        row.member.id === "member-andy").milestoneAllocationPercent, 0);
    } finally {
      await agent.delete(`/api/topics/${created.body.id}`).set("x-csrf-token", csrf).expect(204);
    }
  });

  test("shifts dependent topic chains and milestones, but blocks work until prerequisites complete", async () => {
    const agent = request.agent(app);
    await agent.get("/api/session").expect(200);
    const csrf = (await agent.get("/api/auth/csrf").expect(200)).body.csrfToken;
    const ids: string[] = [];
    const create = async (title: string, start: string, finish: string, dependsOnTopicId?: string) => {
      const result = await agent.post("/api/topics").set("x-csrf-token", csrf)
        .send({
          title: `${title} ${randomUUID()}`, description: "Temporary dependency scheduling test topic.",
          departmentId: "dept-platform", roleId: "role-ci-validation",
          priority: "P3", primaryAssigneeId: "member-andy",
          estimatedStartDate: start, estimatedFinishDate: finish, dependsOnTopicId,
        }).expect(201);
      ids.push(result.body.id);
      return result.body;
    };
    const detail = async (id: string) => (await agent.get(`/api/topics/${id}`).expect(200)).body;
    const occupancy = async () => {
      const rows = (await agent
        .get("/api/occupancy/overview?startDate=2044-02-08&endDate=2044-02-10")
        .expect(200)).body;
      return rows.find((row: { member: { id: string } }) => row.member.id === "member-andy");
    };
    try {
      const parent = await create("Dependency predecessor", "2044-01-01", "2044-01-31");
      const candidates = (await agent.get("/api/topics/dependency-candidates").expect(200)).body;
      assert.ok(candidates.some((item: { id: string }) => item.id === parent.id));
      const child = await create("Dependent work", "2044-01-31", "2044-02-10", parent.id);
      const grandchild = await create("Next dependent work", "2044-02-10", "2044-02-15", child.id);
      assert.equal(child.dependency.id, parent.id);
      assert.equal((await detail(grandchild.id)).dependency.id, child.id);
      const milestone = await agent.post(`/api/topics/${child.id}/milestones`)
        .set("x-csrf-token", csrf)
        .send({
          title: "Dependent milestone", beginDate: "2044-02-01", targetDate: "2044-02-03",
          allocations: [{ memberId: "member-andy", allocationPercent: 20 }],
        }).expect(201);
      const nextMilestone = await agent.post(`/api/topics/${grandchild.id}/milestones`)
        .set("x-csrf-token", csrf)
        .send({ title: "Next milestone", beginDate: "2044-02-11", targetDate: "2044-02-12" })
        .expect(201);
      await agent.post(`/api/topics/${child.id}/validate`).set("x-csrf-token", csrf).send({}).expect(200);
      assert.equal((await occupancy()).milestoneAllocationPercent, 0);
      await agent.patch(`/api/topics/${child.id}`).set("x-csrf-token", csrf)
        .send({ status: "in_progress" }).expect(409);
      await agent.post(`/api/topics/${child.id}/assign`).set("x-csrf-token", csrf)
        .send({ memberId: "member-andy" }).expect(409);
      await agent.patch(`/api/milestones/${milestone.body.id}`).set("x-csrf-token", csrf)
        .send({ status: "completed" }).expect(409);
      await agent.patch(`/api/topics/${child.id}`).set("x-csrf-token", csrf)
        .send({ estimatedStartDate: "2044-02-02" }).expect(409);
      await agent.patch(`/api/topics/${parent.id}`).set("x-csrf-token", csrf)
        .send({ estimatedFinishDate: null }).expect(409);
      await agent.delete(`/api/topics/${parent.id}`).set("x-csrf-token", csrf).expect(409);
      const changed = await agent.patch(`/api/topics/${parent.id}`).set("x-csrf-token", csrf)
        .send({ estimatedFinishDate: "2044-02-07" });
      assert.equal(changed.status, 200, changed.text);
      const shiftedChild = await detail(child.id);
      assert.equal(shiftedChild.estimatedStartDate.slice(0, 10), "2044-02-07");
      assert.equal(shiftedChild.estimatedFinishDate.slice(0, 10), "2044-02-17");
      assert.equal(shiftedChild.milestones.find((m: { id: string }) => m.id === milestone.body.id).beginDate.slice(0, 10), "2044-02-08");
      assert.equal(shiftedChild.milestones.find((m: { id: string }) => m.id === milestone.body.id).targetDate.slice(0, 10), "2044-02-10");
      const shiftedGrandchild = await detail(grandchild.id);
      assert.equal(shiftedGrandchild.estimatedStartDate.slice(0, 10), "2044-02-17");
      assert.equal(shiftedGrandchild.estimatedFinishDate.slice(0, 10), "2044-02-22");
      assert.equal(shiftedGrandchild.milestones.find((m: { id: string }) => m.id === nextMilestone.body.id).beginDate.slice(0, 10), "2044-02-18");
      assert.equal((await occupancy()).milestoneAllocationPercent, 0);
      await agent.post(`/api/topics/${parent.id}/validate`).set("x-csrf-token", csrf).send({}).expect(200);
      await agent.patch(`/api/topics/${parent.id}`).set("x-csrf-token", csrf)
        .send({ status: "completed" }).expect(200);
      assert.equal((await occupancy()).milestoneAllocationPercent, 20);
      await agent.patch(`/api/topics/${child.id}`).set("x-csrf-token", csrf)
        .send({ status: "in_progress" }).expect(200);
      await agent.patch(`/api/topics/${grandchild.id}`).set("x-csrf-token", csrf)
        .send({ status: "in_progress" }).expect(409);
      await agent.patch(`/api/topics/${child.id}`).set("x-csrf-token", csrf)
        .send({ status: "completed" }).expect(200);
      await agent.post(`/api/topics/${grandchild.id}/validate`).set("x-csrf-token", csrf).send({}).expect(200);
      await agent.patch(`/api/topics/${grandchild.id}`).set("x-csrf-token", csrf)
        .send({ status: "in_progress" }).expect(200);
      const afterCompletion = (await agent.get("/api/topics/dependency-candidates").expect(200)).body;
      assert.equal(afterCompletion.some((item: { id: string }) => item.id === parent.id), false);
    } finally {
      for (const id of ids.reverse()) {
        await agent.delete(`/api/topics/${id}`).set("x-csrf-token", csrf).expect(204);
      }
    }
  });

  test("saves, displays, and clears a topic documentation URL", async () => {
    const agent = request.agent(app);
    await agent.get("/api/session").expect(200);
    const csrf = await agent.get("/api/auth/csrf").expect(200);
    const roles = await agent.get("/api/directory/roles").expect(200);
    const role = roles.body.find(
      (item: { departmentId: string }) => item.departmentId === "dept-platform",
    );
    assert.ok(role);
    const created = await agent
      .post("/api/topics")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({
        title: `Documentation link ${randomUUID()}`,
        description: "Temporary topic for documentation URL verification.",
        departmentId: "dept-platform",
        roleId: role.id,
        priority: "P3",
      })
      .expect(201);
    try {
      assert.equal(created.body.documentationUrl, null);
      const path = `/api/topics/${created.body.id}`;
      const saved = await agent.patch(path)
        .set("x-csrf-token", csrf.body.csrfToken)
        .send({ documentationUrl: "https://docs.example.org/guide" })
        .expect(200);
      assert.equal(saved.body.documentationUrl, "https://docs.example.org/guide");
      const loaded = await agent.get(path).expect(200);
      assert.equal(loaded.body.documentationUrl, "https://docs.example.org/guide");
      await agent.patch(path)
        .set("x-csrf-token", csrf.body.csrfToken)
        .send({ documentationUrl: "javascript:alert(1)" })
        .expect(400);
      await agent.patch(path)
        .set("x-csrf-token", csrf.body.csrfToken)
        .send({ documentationUrl: "https://user:password@docs.example.org" })
        .expect(400);
      const cleared = await agent.patch(path)
        .set("x-csrf-token", csrf.body.csrfToken)
        .send({ documentationUrl: null })
        .expect(200);
      assert.equal(cleared.body.documentationUrl, null);
      assert.equal((await agent.get(path).expect(200)).body.documentationUrl, null);
    } finally {
      await db.delete(activityTable).where(eq(activityTable.topicId, created.body.id));
      await db.delete(topicsTable).where(eq(topicsTable.id, created.body.id));
    }
  });
});
