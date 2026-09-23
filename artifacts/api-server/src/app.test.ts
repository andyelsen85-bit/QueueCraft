import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as queuecraftSchema from "@workspace/db/schema";
import {
  activityTable,
  auditLogTable,
  db,
  departmentsTable,
  membersTable,
  milestonesTable,
  pool,
  rolesTable,
  topicFinishDateRevisionsTable,
  topicAllocationsTable,
  topicsTable,
} from "@workspace/db";
import app from "./app";
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
import {
  decryptRuntimeSettings,
  encryptRuntimeSettings,
} from "./services/application-settings";
import { serializeOidcRequestBody } from "./services/oidc";

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

  test("rejects a state-changing request without a CSRF token", async () => {
    const agent = request.agent(app);
    await agent.get("/api/session").expect(200);
    await agent
      .patch("/api/preferences/topic-filters")
      .send({ departmentId: null, status: null, priority: null })
      .expect(403);
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

  test("allows service authorities to edit directory data without changing CIO authority", async () => {
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
      .expect(403);
    await agent
      .patch("/api/directory/departments/dept-platform")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({ name: "Platform Services" })
      .expect(200);
    await db.delete(membersTable).where(eq(membersTable.id, created.body.id));
  });

  test("cannot bypass or replay pending topic validation", async () => {
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
        title: `Validation policy ${randomUUID()}`,
        description:
          "Temporary topic used to verify the validation transition policy.",
        departmentId: "dept-platform",
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

  test("applies topic and milestone workload across their date ranges", async () => {
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
    await agent
      .put(`/api/topics/${created.body.id}/allocations`)
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({
        allocations: [{ memberId: "member-andy", allocationPercent: 20 }],
      })
      .expect(200);
    const milestone = await agent
      .post(`/api/topics/${created.body.id}/milestones`)
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({
        title: "Focused delivery",
        beginDate: "2041-01-08",
        targetDate: "2041-01-17",
        assigneeId: "member-andy",
        workloadPercent: 15,
      })
      .expect(201);
    const during = await agent
      .get("/api/occupancy/overview?startDate=2041-01-13&endDate=2041-01-19")
      .expect(200);
    const row = during.body.find(
      (item: { member: { id: string } }) => item.member.id === "member-andy",
    );
    assert.equal(row.topicAllocationPercent, 20);
    assert.equal(row.milestoneAllocationPercent, 11);
    assert.equal(row.totalOccupancyPercent, row.dailyBusinessPercent + 31);
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
});
