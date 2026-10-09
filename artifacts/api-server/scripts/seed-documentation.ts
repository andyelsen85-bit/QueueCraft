import { writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import {
  db, pool, membersTable, departmentsTable, rolesTable, roleMembersTable,
  topicsTable, milestonesTable, milestoneAllocationsTable, topicCollaboratorsTable,
  collaboratorMilestonesTable, activityTable, notificationSettingsTable, notificationRulesTable,
} from "@workspace/db";
import { hashLocalPassword } from "../src/services/local-password";
import { updateRuntimeSettings } from "../src/services/application-settings";

const url = new URL(process.env.DATABASE_URL ?? "");
if (process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/queuecraft_documentation") {
  throw new Error("Documentation seeding is restricted to the disposable local queuecraft_documentation database.");
}
if ((await db.select({ id: membersTable.id }).from(membersTable).limit(1)).length) {
  throw new Error("Refusing to seed a database containing existing members.");
}
const password = randomBytes(18).toString("base64url");
const passwordHash = await hashLocalPassword(password);
const today = new Date();
const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
const date = (offset: number) => {
  const value = new Date(monday); value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};
const names = ["Morgan Vale", "Eli Rowan", "Priya Marsh", "Nora Finch", "Owen Reed", "Sofia Hart",
  "Theo Brook", "Mira Stone", "Jordan Lake", "Cal Avery", "Sam Ellis", "Lena Quinn"];
const ids = names.map((_, i) => i === 0 ? "local-admin" : `demo-member-${i + 1}`);
const titles = ["Head of Service", "Network Engineer", "Platform Lead", "Deputy Head",
  "Service Desk Lead", "Service Analyst", "Solutions Head", "Product Lead", "Integration Lead",
  "Business Analyst", "Software Engineer", "Support Specialist"];
await db.transaction(async tx => {
  await tx.insert(membersTable).values(names.map((name, i) => ({
    id: ids[i], name, initials: name.split(" ").map(part => part[0]).join(""),
    email: `${name.toLowerCase().replace(" ", ".")}@queuecraft.example.invalid`, title: titles[i],
    authProvider: "local", passwordHash, isCio: false, cioOverride: null,
    weeklyHours: i % 3 === 0 ? 40 : i % 3 === 1 ? 32 : 36,
    dailyBusinessPercent: i === 11 ? 55 : 40,
    dailyBusinessTasks: [
      { name: i < 6 ? "Service requests and incident follow-up" : "Application support and maintenance", percent: i === 11 ? 30 : 20 },
      { name: "Team coordination and documentation", percent: 15 },
      { name: "Operational checks and reporting", percent: i === 11 ? 10 : 5 },
    ],
  })));
  await tx.insert(departmentsTable).values([
    { id: "demo-operations", name: "Operations", serviceHeadId: ids[0], serviceHeadDeputyId: ids[3] },
    { id: "demo-solutions", name: "Solutions", serviceHeadId: ids[6], serviceHeadDeputyId: ids[7] },
  ]);
  await updateRuntimeSettings({ adminMemberId: ids[0], adminPasswordHash: passwordHash }, ids[0], tx);
  const roleNames = ["Network Services", "Platform Operations", "Service Desk", "Product Delivery", "Integrations", "Business Analysis"];
  const leads = [0, 2, 4, 6, 7, 8], deputies = [1, 3, 5, 2, 9, 6];
  await tx.insert(rolesTable).values(roleNames.map((name, i) => ({
    id: `demo-role-${i + 1}`, name, departmentId: i < 3 ? "demo-operations" : "demo-solutions",
    leadId: ids[leads[i]], deputyId: ids[deputies[i]],
  })));
  await tx.insert(roleMembersTable).values(roleNames.flatMap((_, i) =>
    [...new Set([leads[i], deputies[i], i < 3 ? 11 : 10])].map(index => ({
      roleId: `demo-role-${i + 1}`, memberId: ids[index],
    }))));
  const topicTitles = ["Supplier access review", "Reporting workspace refresh",
    "Network redundancy upgrade", "Self-service request portal", "Knowledge base consolidation",
    "Integration monitoring rollout", "Endpoint configuration baseline", "Access request automation",
    "Service catalog redesign", "Release readiness checklist"];
  const statuses = ["pending_validation", "pending_validation", "open", "open", "in_progress",
    "in_progress", "in_progress", "completed", "returned", "returned"] as const;
  const roles = [1, 2, 1, 4, 3, 5, 2, 4, 3, 6];
  await tx.insert(topicsTable).values(topicTitles.map((title, i) => ({
    id: `demo-topic-${i + 1}`, title,
    description: `Improve ${title.toLowerCase()} through a scoped delivery plan, clear ownership and a documented handover. Coordinate the rollout with both service teams and confirm acceptance criteria before completion.`,
    departmentId: roles[i] <= 3 ? "demo-operations" : "demo-solutions", roleId: `demo-role-${roles[i]}`,
    creatorId: ids[i < 2 ? 10 : 6], primaryAssigneeId: i === 2 || i === 4 ? ids[0] : ids[i === 6 ? 11 : (i + 2) % 12],
    priority: (["P2", "P3", "P1", "P2", "P2", "P1", "P3", "P3", "P4", "P2"] as const)[i],
    status: statuses[i], estimatedStartDate: date(i < 2 ? 7 : -7),
    estimatedFinishDate: date(21 + i * 2), estimatedEffortHours: [80, 120, 160, 220, 96, 140, 120, 72, 100, 64][i],
    targetDate: i === 7 ? date(-3) : null,
    validatorId: i < 2 ? null : ids[roles[i] <= 3 ? 0 : 6],
    validatedAt: i < 2 ? null : new Date(Date.now() - 86400000 * 10),
    createdAt: new Date(Date.now() - 86400000 * (18 - i)),
    completedAt: i === 7 ? new Date(Date.now() - 86400000 * 3) : null,
    completionSummary: i === 7 ? "Acceptance checks passed and the runbook has been handed over." : null,
  })));
  const plans = [
    { topic: 5, title: "Content audit and ownership", status: "in_progress" as const, from: 0, to: 11, allocations: [[0, 25], [11, 70]] },
    { topic: 5, title: "Publish the consolidated knowledge base", status: "not_started" as const, from: 14, to: 23, allocations: [[4, 30], [5, 35]] },
    { topic: 3, title: "Confirm network failover design", status: "not_started" as const, from: 7, to: 16, allocations: [[1, 60], [3, 20]] },
    { topic: 4, title: "Define service request journeys", status: "not_started" as const, from: 0, to: 9, allocations: [[7, 40], [10, 50]] },
    { topic: 6, title: "Configure monitoring connectors", status: "in_progress" as const, from: 0, to: 18, allocations: [[8, 65], [10, 35]] },
    { topic: 7, title: "Pilot workstation baseline", status: "in_progress" as const, from: 0, to: 4, allocations: [[2, 40], [5, 45]] },
    { topic: 8, title: "Acceptance and handover", status: "completed" as const, from: -14, to: -3, allocations: [[7, 25], [9, 35]] },
    { topic: 9, title: "Address review feedback", status: "returned" as const, from: 0, to: 9, allocations: [[4, 20], [5, 15]] },
  ];
  for (const [i, plan] of plans.entries()) {
    const milestoneId = `demo-milestone-${i + 1}`;
    await tx.insert(milestonesTable).values({
      id: milestoneId, topicId: `demo-topic-${plan.topic}`, title: plan.title,
      description: "Agree the deliverables, review evidence and record the operational handover.",
      status: plan.status, beginDate: date(plan.from), targetDate: date(plan.to),
      assigneeId: ids[plan.allocations[0][0]], workloadPercent: plan.allocations[0][1],
    });
    await tx.insert(milestoneAllocationsTable).values(plan.allocations.map(([index, allocationPercent]) => ({
      milestoneId, memberId: ids[index], allocationPercent,
    })));
    for (const [index] of plan.allocations) {
      const collaboratorId = `demo-collaborator-${plan.topic}-${index}`;
      await tx.insert(topicCollaboratorsTable).values({
        id: collaboratorId, topicId: `demo-topic-${plan.topic}`, memberId: ids[index],
      }).onConflictDoNothing();
      await tx.insert(collaboratorMilestonesTable).values({ collaboratorId, milestoneId }).onConflictDoNothing();
    }
  }
  await tx.insert(activityTable).values([
    { id: "demo-activity-1", topicId: "demo-topic-5", actorId: ids[0], action: "Milestone updated", detail: "Content audit started. Two collaborators assigned with an agreed delivery period.", createdAt: new Date(Date.now() - 900000) },
    { id: "demo-activity-2", topicId: "demo-topic-1", actorId: ids[10], action: "Topic created", detail: "Supplier access review submitted to Operations for validation.", createdAt: new Date(Date.now() - 3600000) },
    { id: "demo-activity-3", topicId: "demo-topic-8", actorId: ids[6], action: "Topic updated", detail: "Access request automation completed; acceptance evidence recorded.", createdAt: new Date(Date.now() - 7200000) },
    { id: "demo-activity-4", topicId: "demo-topic-9", actorId: ids[0], action: "Topic updated", detail: "Returned for clarification of the service ownership model.", createdAt: new Date(Date.now() - 10800000) },
  ]);
  await tx.insert(notificationSettingsTable).values({ id: "default", frequencyMinutes: 15 });
  await tx.insert(notificationRulesTable).values([
    { id: "demo-notify-create", action: "topic.created", enabled: true, recipientGroups: ["head_of_service", "head_of_service_deputy"] },
    { id: "demo-notify-validation", action: "topic.validation", enabled: true, recipientGroups: ["lead_of_affected_role", "affected_role_members"] },
    { id: "demo-notify-review", action: "topic.pipeline_review_due", enabled: true, recipientGroups: ["head_of_service", "head_of_service_deputy"] },
  ]);
});
await writeFile("/tmp/queuecraft-documentation-login.json", JSON.stringify({
  head: { username: "morgan.vale@queuecraft.example.invalid", password },
  member: { username: "lena.quinn@queuecraft.example.invalid", password },
  date: date(0), detailTopicId: "demo-topic-5", milestoneId: "demo-milestone-1",
}), { mode: 0o600 });
await pool.end();
console.log("Fictional documentation dataset seeded: 2 departments, 6 roles, 12 members, 10 topics, 8 milestones.");
