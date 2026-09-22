import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { eq } from "drizzle-orm";
import {
  activityTable,
  db,
  departmentsTable,
  membersTable,
  pool,
  rolesTable,
  topicsTable,
} from "@workspace/db";
import app from "./app";

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

  test("cannot bypass or replay pending topic validation", async () => {
    const agent = request.agent(app);
    await agent.get("/api/session").expect(200);
    const csrf = await agent.get("/api/auth/csrf").expect(200);
    const roles = await agent.get("/api/directory/roles").expect(200);
    const role = roles.body.find((item: { departmentId: string }) => item.departmentId === "dept-platform");
    assert.ok(role);

    const created = await agent
      .post("/api/topics")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({
        title: `Validation policy ${randomUUID()}`,
        description: "Temporary topic used to verify the validation transition policy.",
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

    await db.delete(activityTable).where(eq(activityTable.topicId, created.body.id));
    await db.delete(topicsTable).where(eq(topicsTable.id, created.body.id));
  });
});