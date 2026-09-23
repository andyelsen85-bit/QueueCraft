import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  activityTable,
  auditLogTable,
  collaboratorMilestonesTable,
  departmentsTable,
  membersTable,
  milestonesTable,
  roleMembersTable,
  roleDepartmentsTable,
  rolesTable,
  topicCollaboratorsTable,
  topicFinishDateRevisionsTable,
  topicWeeklyAllocationsTable,
  topicsTable,
} from "@workspace/db";
import {
  AddTopicCollaboratorBody,
  AddTopicCollaboratorParams,
  AddTopicCollaboratorResponse,
  AddTopicMilestoneBody,
  AddTopicMilestoneParams,
  AddTopicMilestoneResponse,
  AssignTopicBody,
  AssignTopicParams,
  AssignTopicResponse,
  CreateTopicBody,
  CreateTopicResponse,
  GetDashboardActivityQueryParams,
  GetDashboardActivityResponse,
  GetDashboardSummaryResponse,
  GetMyWorkResponse,
  GetSessionResponse,
  GetTopicParams,
  GetTopicResponse,
  GetValidationQueueResponse,
  ListDepartmentsResponse,
  ListMembersResponse,
  ListRolesResponse,
  ListTopicsQueryParams,
  ListTopicsResponse,
  UpdateMilestoneBody,
  UpdateMilestoneParams,
  UpdateMilestoneResponse,
  UpdateTopicBody,
  UpdateTopicParams,
  UpdateTopicResponse,
  GetTopicFilterPreferencesResponse,
  UpdateTopicFilterPreferencesBody,
  UpdateTopicFilterPreferencesResponse,
  CreateDepartmentBody,
  CreateDepartmentResponse,
  UpdateDepartmentBody,
  UpdateDepartmentParams,
  UpdateDepartmentResponse,
  CreateRoleBody,
  CreateRoleResponse,
  UpdateRoleBody,
  UpdateRoleParams,
  UpdateRoleResponse,
  CreateMemberBody,
  CreateMemberResponse,
  UpdateMemberBody,
  UpdateMemberParams,
  UpdateMemberResponse,
  ValidateTopicBody,
  ValidateTopicBreakGlassBody,
  ValidateTopicBreakGlassParams,
  ValidateTopicBreakGlassResponse,
  ValidateTopicParams,
  ValidateTopicResponse,
  UpdateTopicFinishDateBody,
  UpdateTopicFinishDateParams,
  UpdateTopicFinishDateResponse,
  GetTopicAllocationsParams,
  GetTopicAllocationsResponse,
  ReplaceTopicAllocationsBody,
  ReplaceTopicAllocationsParams,
  ReplaceTopicAllocationsResponse,
  DeleteMilestoneParams,
  GetOccupancyOverviewQueryParams,
  GetOccupancyOverviewResponse,
} from "@workspace/api-zod";
import { breakGlassLimiter } from "../middleware/security";
import { queueMail } from "../services/mailer";
import { getRuntimeSettings, maskedStatus, updateRuntimeSettings, type RuntimeSettings } from "../services/application-settings";
import { searchLdapsUsers } from "../services/ldaps";

const router: IRouter = Router();

function currentUserId(req: Request) {
  if (!req.session.userId) throw new Error("Authenticated session has no user");
  return req.session.userId;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

const dateOnly = (value: Date | string | null | undefined) => {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
};

async function loadSnapshot() {
  const [
    members,
    departments,
    roles,
    roleDepartments,
    roleMembers,
    topics,
    collaborators,
    collaboratorMilestones,
    milestones,
    activities,
    allocations,
    finishDateRevisions,
  ] = await Promise.all([
    db.select().from(membersTable),
    db.select().from(departmentsTable),
    db.select().from(rolesTable),
    db.select().from(roleDepartmentsTable),
    db.select().from(roleMembersTable),
    db.select().from(topicsTable).orderBy(desc(topicsTable.updatedAt)),
    db.select().from(topicCollaboratorsTable),
    db.select().from(collaboratorMilestonesTable),
    db.select().from(milestonesTable),
    db.select().from(activityTable).orderBy(desc(activityTable.createdAt)),
    db.select().from(topicWeeklyAllocationsTable),
    db.select().from(topicFinishDateRevisionsTable).orderBy(desc(topicFinishDateRevisionsTable.createdAt)),
  ]);

  const memberById = new Map(members.map((member) => [member.id, member]));
  const departmentById = new Map(departments.map((department) => [department.id, department]));
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const member = (id: string | null) => (id ? memberById.get(id) ?? null : null);

  const buildDepartment = (id: string) => {
    const department = departmentById.get(id);
    if (!department) throw new Error(`Department ${id} not found`);
    const serviceHead = member(department.serviceHeadId);
    if (!serviceHead) throw new Error(`Service Head for ${id} not found`);
    return {
      id: department.id,
      name: department.name,
      serviceHead,
      serviceHeadDeputy: member(department.serviceHeadDeputyId),
    };
  };

  const buildRole = (id: string) => {
    const role = roleById.get(id);
    if (!role) throw new Error(`Role ${id} not found`);
    const lead = member(role.leadId);
    if (!lead) throw new Error(`Role Lead for ${id} not found`);
    return {
      id: role.id,
      name: role.name,
      departmentId: role.departmentId,
      departmentIds: [...new Set([role.departmentId, ...roleDepartments.filter((entry) => entry.roleId === id).map((entry) => entry.departmentId)])],
      lead,
      deputy: member(role.deputyId),
      memberCount: roleMembers.filter((entry) => entry.roleId === id).length,
      memberIds: roleMembers.filter((entry) => entry.roleId === id).map((entry) => entry.memberId),
    };
  };

  const buildMilestone = (milestone: (typeof milestones)[number]) => ({
    id: milestone.id,
    title: milestone.title,
    description: milestone.description,
    status: milestone.status,
    targetDate: milestone.targetDate,
    assignee: member(milestone.assigneeId),
    completionNote: milestone.completionNote,
    completedAt: milestone.completedAt,
  });

  const buildActivity = (activity: (typeof activities)[number]) => {
    const actor = member(activity.actorId);
    if (!actor) throw new Error(`Activity actor ${activity.actorId} not found`);
    return {
      id: activity.id,
      action: activity.action,
      detail: activity.detail,
      actor,
      createdAt: activity.createdAt,
      isBreakGlass: activity.isBreakGlass,
    };
  };

  const buildTopic = (topic: (typeof topics)[number]) => {
    const creator = member(topic.creatorId);
    if (!creator) throw new Error(`Topic creator ${topic.creatorId} not found`);
    const topicMilestones = milestones.filter((milestone) => milestone.topicId === topic.id);
    return {
      id: topic.id,
      title: topic.title,
      description: topic.description,
      department: buildDepartment(topic.departmentId),
      role: buildRole(topic.roleId),
      priority: topic.priority,
      status: topic.status,
      creator,
      primaryAssignee: member(topic.primaryAssigneeId),
      collaborators: collaborators
        .filter((collaborator) => collaborator.topicId === topic.id)
        .map((collaborator) => {
          const collaboratorMember = member(collaborator.memberId);
          if (!collaboratorMember) throw new Error(`Collaborator ${collaborator.memberId} not found`);
          return {
            id: collaborator.id,
            member: collaboratorMember,
            addedAt: collaborator.addedAt,
            milestoneIds: collaboratorMilestones
              .filter((entry) => entry.collaboratorId === collaborator.id)
              .map((entry) => entry.milestoneId),
          };
        }),
      milestoneCount: topicMilestones.length,
      completedMilestoneCount: topicMilestones.filter(
        (milestone) => milestone.status === "completed",
      ).length,
      targetDate: topic.targetDate,
      estimatedStartDate: topic.estimatedStartDate,
      estimatedFinishDate: topic.estimatedFinishDate,
      estimatedEffortHours: topic.estimatedEffortHours,
      validationMode: topic.validationMode,
      validationReason: topic.validationReason,
      validator: member(topic.validatorId),
      validatedAt: topic.validatedAt,
      createdAt: topic.createdAt,
      updatedAt: topic.updatedAt,
      completedAt: topic.completedAt,
    };
  };

  const buildTopicDetail = (topic: (typeof topics)[number]) => ({
    ...buildTopic(topic),
    milestones: milestones
      .filter((milestone) => milestone.topicId === topic.id)
      .map(buildMilestone),
    activity: activities
      .filter((activity) => activity.topicId === topic.id)
      .map(buildActivity),
    allocations: allocations
      .filter((allocation) => allocation.topicId === topic.id)
      .map((allocation) => ({
        topicId: allocation.topicId,
        member: member(allocation.memberId),
        weekStart: allocation.weekStart,
        allocationPercent: allocation.allocationPercent,
      })),
    finishDateRevisions: finishDateRevisions
      .filter((revision) => revision.topicId === topic.id)
      .map((revision) => ({
        id: revision.id,
        previousTargetDate: revision.previousTargetDate,
        newTargetDate: revision.newTargetDate,
        note: revision.note,
        actor: member(revision.actorId),
        createdAt: revision.createdAt,
      })),
    completionSummary: topic.completionSummary,
  });

  return {
    members,
    departments,
    roles,
    roleDepartments,
    topics,
    milestones,
    activities,
    collaborators,
    allocations,
    finishDateRevisions,
    memberById,
    departmentById,
    roleById,
    buildDepartment,
    buildRole,
    buildMilestone,
    buildActivity,
    buildTopic,
    buildTopicDetail,
  };
}

async function addActivity(
  req: Request,
  topicId: string | null,
  action: string,
  detail: string,
  isBreakGlass = false,
  executor: any = db,
) {
  await executor.insert(activityTable).values({
    id: randomUUID(),
    topicId,
    actorId: currentUserId(req),
    action,
    detail,
    isBreakGlass,
  });
  await executor.insert(auditLogTable).values({
    id: randomUUID(),
    actorId: currentUserId(req),
    action,
    resourceType: topicId ? "topic" : "system",
    resourceId: topicId,
    requestId: String(req.id),
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
    details: { detail },
    isBreakGlass,
  });
}

function getCapabilities(
  userId: string,
  snapshot: Awaited<ReturnType<typeof loadSnapshot>>,
) {
  const user = snapshot.memberById.get(userId);
  const isServiceAuthority = snapshot.departments.some((department) =>
    [department.serviceHeadId, department.serviceHeadDeputyId].includes(userId),
  );
  const isRoleAuthority = snapshot.roles.some((role) =>
    [role.leadId, role.deputyId].includes(userId),
  );
  const capabilities = ["topic.create", "topic.edit", "topic.assign"];
  if (isServiceAuthority) capabilities.push("validation.approve", "directory.manage", "settings.manage");
  if (isServiceAuthority || user?.isCio) capabilities.push("validation.break_glass");
  if (user?.isCio) capabilities.push("directory.manage", "directory.manage_cio", "settings.manage");
  if (isRoleAuthority) capabilities.push("role.execute");
  return [...new Set(capabilities)];
}

function requireCapability(
  req: Request,
  res: Response,
  snapshot: Awaited<ReturnType<typeof loadSnapshot>>,
  capability: string,
) {
  if (!getCapabilities(currentUserId(req), snapshot).includes(capability)) {
    res.status(403).json({ error: `Missing capability: ${capability}` });
    return false;
  }
  return true;
}

function canManageTopic(
  userId: string,
  topic: (Awaited<ReturnType<typeof loadSnapshot>>["topics"])[number],
  snapshot: Awaited<ReturnType<typeof loadSnapshot>>,
) {
  const role = snapshot.roleById.get(topic.roleId);
  const department = snapshot.departmentById.get(topic.departmentId);
  const collaborator = snapshot.collaborators.some(
    (entry) => entry.topicId === topic.id && entry.memberId === userId,
  );
  return Boolean(
    topic.creatorId === userId ||
      topic.primaryAssigneeId === userId ||
      collaborator ||
      [role?.leadId, role?.deputyId].includes(userId) ||
      [department?.serviceHeadId, department?.serviceHeadDeputyId].includes(userId),
  );
}

function canManageDepartment(
  userId: string,
  departmentId: string,
  snapshot: Awaited<ReturnType<typeof loadSnapshot>>,
) {
  if (snapshot.memberById.get(userId)?.isCio) return true;
  const department = snapshot.departmentById.get(departmentId);
  return Boolean(
    department &&
      [department.serviceHeadId, department.serviceHeadDeputyId].includes(userId),
  );
}

function requireTopicManager(
  req: Request,
  res: Response,
  topic: (Awaited<ReturnType<typeof loadSnapshot>>["topics"])[number],
  snapshot: Awaited<ReturnType<typeof loadSnapshot>>,
) {
  if (!canManageTopic(currentUserId(req), topic, snapshot)) {
    res.status(403).json({ error: "You do not have management access to this topic" });
    return false;
  }
  return true;
}

router.get("/session", async (req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  const user = snapshot.memberById.get(currentUserId(req));
  if (!user) {
    res.status(401).json({ error: "No active user" });
    return;
  }
  res.json(
    GetSessionResponse.parse({
      user,
      capabilities: getCapabilities(user.id, snapshot),
      topicFilters: {
        departmentId: user.topicFilterDepartmentId,
        roleId: user.topicFilterRoleId,
        status: user.topicFilterStatus,
        priority: user.topicFilterPriority,
      },
    }),
  );
});

router.get("/admin/settings", async (req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  if (!requireCapability(req, res, snapshot, "settings.manage")) return;
  res.setHeader("Cache-Control", "no-store");
  res.json(maskedStatus(await getRuntimeSettings()));
});

router.put("/admin/settings", async (req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  if (!requireCapability(req, res, snapshot, "settings.manage")) return;
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    res.status(400).json({ error: "Settings must be an object" });
    return;
  }
  const allowed = new Set<keyof RuntimeSettings>([
    "publicBaseUrl", "adfsEnabled", "adfsIssuer", "adfsClientId", "adfsClientSecret", "adfsCaCertificate",
    "ldapsUrl", "ldapsBindDn", "ldapsBindPassword", "ldapsBaseDn", "ldapsUserFilter", "ldapsCaCertificate",
    "smtpHost", "smtpPort", "smtpSecure", "smtpUser", "smtpPassword", "smtpFrom",
  ]);
  const update: Partial<RuntimeSettings> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!allowed.has(key as keyof RuntimeSettings)) continue;
    if (key === "smtpPort") {
      if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 65535) { res.status(400).json({ error: "SMTP port must be between 1 and 65535" }); return; }
      update.smtpPort = Number(value);
    } else if (key === "smtpSecure" || key === "adfsEnabled") {
      if (typeof value !== "boolean") { res.status(400).json({ error: "SMTP secure must be a boolean" }); return; }
      if (key === "smtpSecure") update.smtpSecure = value; else update.adfsEnabled = value;
    } else if (typeof value === "string") {
      (update as Record<string, string>)[key] = value.trim();
    } else {
      res.status(400).json({ error: `Invalid value for ${key}` }); return;
    }
  }
  const saved = await updateRuntimeSettings(update, currentUserId(req));
  res.setHeader("Cache-Control", "no-store");
  res.json(maskedStatus(saved));
});

router.get("/preferences/topic-filters", async (req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  const user = snapshot.memberById.get(currentUserId(req));
  if (!user) {
    res.status(401).json({ error: "No active user" });
    return;
  }
  res.json(
    GetTopicFilterPreferencesResponse.parse({
      departmentId: user.topicFilterDepartmentId,
      roleId: user.topicFilterRoleId,
      status: user.topicFilterStatus,
      priority: user.topicFilterPriority,
    }),
  );
});

router.patch("/preferences/topic-filters", async (req, res): Promise<void> => {
  const body = UpdateTopicFilterPreferencesBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (body.data.departmentId) {
    const [department] = await db
      .select({ id: departmentsTable.id })
      .from(departmentsTable)
      .where(eq(departmentsTable.id, body.data.departmentId))
      .limit(1);
    if (!department) {
      res.status(400).json({ error: "Unknown department filter" });
      return;
    }
  }
  const [updated] = await db
    .update(membersTable)
    .set({
      topicFilterDepartmentId: body.data.departmentId ?? null,
      topicFilterRoleId: body.data.roleId ?? null,
      topicFilterStatus: body.data.status ?? null,
      topicFilterPriority: body.data.priority ?? null,
    })
    .where(eq(membersTable.id, currentUserId(req)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(
    UpdateTopicFilterPreferencesResponse.parse({
      departmentId: updated.topicFilterDepartmentId,
      roleId: updated.topicFilterRoleId,
      status: updated.topicFilterStatus,
      priority: updated.topicFilterPriority,
    }),
  );
});

router.get("/directory/members", async (_req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  res.json(ListMembersResponse.parse(snapshot.members));
});

router.post("/directory/members", async (req, res): Promise<void> => {
  const body = CreateMemberBody.safeParse(req.body);
  const snapshot = await loadSnapshot();
  if (!requireCapability(req, res, snapshot, "directory.manage")) return;
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (body.data.isCio && !getCapabilities(currentUserId(req), snapshot).includes("directory.manage_cio")) {
    res.status(403).json({ error: "Only the CIO may grant CIO authority" });
    return;
  }
  const [created] = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(membersTable)
      .values({
        id: randomUUID(),
        name: body.data.name.trim(),
        initials: initials(body.data.name),
        email: body.data.email.toLowerCase(),
        title: body.data.title,
        externalSubject: body.data.externalSubject,
        isCio: body.data.isCio,
      })
      .returning();
    await addActivity(req, null, "Directory member created", rows[0].email, false, tx);
    return rows;
  });
  res.status(201).json(CreateMemberResponse.parse(created));
});

router.get("/directory/ldap-users", async (req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  if (!requireCapability(req, res, snapshot, "directory.manage")) return;
  try { res.json(await searchLdapsUsers(typeof req.query.search === "string" ? req.query.search : "")); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Active Directory search failed" }); }
});

router.post("/directory/ldap-users/import", async (req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  if (!requireCapability(req, res, snapshot, "directory.manage")) return;
  const users = Array.isArray(req.body?.users) ? req.body.users : [];
  const imported = [];
  for (const user of users) {
    if (typeof user?.email !== "string" || typeof user?.name !== "string" || typeof user?.subject !== "string") continue;
    const existing = await db.select().from(membersTable).where(eq(membersTable.email, user.email.toLowerCase())).limit(1);
    if (existing[0]) continue;
    const [member] = await db.insert(membersTable).values({ id: randomUUID(), name: user.name.trim(), initials: initials(user.name), email: user.email.toLowerCase(), externalSubject: user.subject, authProvider: "adfs", status: "active" }).returning();
    imported.push(member);
  }
  res.status(201).json({ imported: imported.length });
});

router.patch("/directory/members/:memberId", async (req, res): Promise<void> => {
  const params = UpdateMemberParams.safeParse(req.params);
  const body = UpdateMemberBody.safeParse(req.body);
  const snapshot = await loadSnapshot();
  if (!requireCapability(req, res, snapshot, "directory.manage")) return;
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid member update" });
    return;
  }
  if (body.data.isCio !== undefined && !getCapabilities(currentUserId(req), snapshot).includes("directory.manage_cio")) {
    res.status(403).json({ error: "Only the CIO may change CIO authority" });
    return;
  }
  const [updated] = await db.transaction(async (tx) => {
    const rows = await tx
      .update(membersTable)
      .set({
        ...body.data,
        email: body.data.email?.toLowerCase(),
        initials: body.data.name ? initials(body.data.name) : undefined,
      })
      .where(eq(membersTable.id, params.data.memberId))
      .returning();
    if (rows[0]) {
      await addActivity(req, null, "Directory member updated", rows[0].email, false, tx);
    }
    return rows;
  });
  if (!updated) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  res.json(UpdateMemberResponse.parse(updated));
});

router.get("/directory/departments", async (_req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  res.json(
    ListDepartmentsResponse.parse(
      snapshot.departments.map((department) => snapshot.buildDepartment(department.id)),
    ),
  );
});

router.post("/directory/departments", async (req, res): Promise<void> => {
  const body = CreateDepartmentBody.safeParse(req.body);
  const snapshot = await loadSnapshot();
  if (!requireCapability(req, res, snapshot, "directory.manage")) return;
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [created] = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(departmentsTable)
      .values({
        id: randomUUID(),
        name: body.data.name.trim(),
        serviceHeadId: body.data.serviceHeadId,
        serviceHeadDeputyId: body.data.serviceHeadDeputyId,
      })
      .returning();
    await addActivity(req, null, "Department created", rows[0].name, false, tx);
    return rows;
  });
  const refreshed = await loadSnapshot();
  res.status(201).json(CreateDepartmentResponse.parse(refreshed.buildDepartment(created.id)));
});

router.patch("/directory/departments/:departmentId", async (req, res): Promise<void> => {
  const params = UpdateDepartmentParams.safeParse(req.params);
  const body = UpdateDepartmentBody.safeParse(req.body);
  const snapshot = await loadSnapshot();
  if (!requireCapability(req, res, snapshot, "directory.manage")) return;
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid department update" });
    return;
  }
  if (!canManageDepartment(currentUserId(req), params.data.departmentId, snapshot)) {
    res.status(403).json({ error: "You may only update departments in your assigned scope" });
    return;
  }
  const [updated] = await db.transaction(async (tx) => {
    const rows = await tx
      .update(departmentsTable)
      .set(body.data)
      .where(eq(departmentsTable.id, params.data.departmentId))
      .returning();
    if (rows[0]) {
      await addActivity(req, null, "Department updated", rows[0].name, false, tx);
    }
    return rows;
  });
  if (!updated) {
    res.status(404).json({ error: "Department not found" });
    return;
  }
  const refreshed = await loadSnapshot();
  res.json(UpdateDepartmentResponse.parse(refreshed.buildDepartment(updated.id)));
});

router.get("/directory/roles", async (_req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  res.json(
    ListRolesResponse.parse(snapshot.roles.map((role) => snapshot.buildRole(role.id))),
  );
});

router.post("/directory/roles", async (req, res): Promise<void> => {
  const body = CreateRoleBody.safeParse(req.body);
  const snapshot = await loadSnapshot();
  if (!requireCapability(req, res, snapshot, "directory.manage")) return;
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const departmentIds = [...new Set([body.data.departmentId, ...(body.data.departmentIds ?? [])])];
  if (!departmentIds.every((departmentId) => snapshot.departmentById.has(departmentId))) {
    res.status(400).json({ error: "One or more departments do not exist" });
    return;
  }
  if (!departmentIds.every((departmentId) => canManageDepartment(currentUserId(req), departmentId, snapshot))) {
    res.status(403).json({ error: "You may only create roles in your assigned departments" });
    return;
  }
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(rolesTable).values({
      id,
      name: body.data.name.trim(),
      departmentId: body.data.departmentId,
      leadId: body.data.leadId,
      deputyId: body.data.deputyId,
    });
    await tx.insert(roleDepartmentsTable).values(departmentIds.map((departmentId) => ({ roleId: id, departmentId })));
    const memberIds = [...new Set([...(body.data.memberIds ?? []), body.data.leadId, body.data.deputyId].filter(Boolean))] as string[];
    if (memberIds.length) {
      await tx.insert(roleMembersTable).values(memberIds.map((memberId) => ({ roleId: id, memberId })));
    }
    await addActivity(req, null, "Role created", body.data.name, false, tx);
  });
  const refreshed = await loadSnapshot();
  res.status(201).json(CreateRoleResponse.parse(refreshed.buildRole(id)));
});

router.patch("/directory/roles/:roleId", async (req, res): Promise<void> => {
  const params = UpdateRoleParams.safeParse(req.params);
  const body = UpdateRoleBody.safeParse(req.body);
  const snapshot = await loadSnapshot();
  if (!requireCapability(req, res, snapshot, "directory.manage")) return;
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid role update" });
    return;
  }
  const currentRole = snapshot.roleById.get(params.data.roleId);
  if (!currentRole) {
    res.status(404).json({ error: "Role not found" });
    return;
  }
  const currentDepartmentIds = snapshot.roleDepartments.filter((entry) => entry.roleId === currentRole.id).map((entry) => entry.departmentId);
  const departmentIds = [...new Set([body.data.departmentId ?? currentRole.departmentId, ...(body.data.departmentIds ?? currentDepartmentIds)])];
  if (!departmentIds.every((departmentId) => snapshot.departmentById.has(departmentId))) {
    res.status(400).json({ error: "One or more departments do not exist" });
    return;
  }
  if (![...currentDepartmentIds, ...departmentIds].every((departmentId) => canManageDepartment(currentUserId(req), departmentId, snapshot))) {
    res.status(403).json({ error: "You may only update roles in your assigned departments" });
    return;
  }
  await db.transaction(async (tx) => {
    await tx
      .update(rolesTable)
      .set({
        name: body.data.name,
        departmentId: body.data.departmentId,
        leadId: body.data.leadId,
        deputyId: body.data.deputyId,
      })
      .where(eq(rolesTable.id, params.data.roleId));
    if (body.data.departmentIds || body.data.departmentId) {
      await tx.delete(roleDepartmentsTable).where(eq(roleDepartmentsTable.roleId, params.data.roleId));
      await tx.insert(roleDepartmentsTable).values(departmentIds.map((departmentId) => ({ roleId: params.data.roleId, departmentId })));
    }
    if (body.data.memberIds) {
      await tx.delete(roleMembersTable).where(eq(roleMembersTable.roleId, params.data.roleId));
      const current = snapshot.roleById.get(params.data.roleId);
      const memberIds = [...new Set([
        ...body.data.memberIds,
        body.data.leadId ?? current?.leadId,
        body.data.deputyId === undefined ? current?.deputyId : body.data.deputyId,
      ].filter(Boolean))] as string[];
      if (memberIds.length) {
        await tx
          .insert(roleMembersTable)
          .values(memberIds.map((memberId) => ({ roleId: params.data.roleId, memberId })));
      }
    }
    await addActivity(req, null, "Role updated", params.data.roleId, false, tx);
  });
  const refreshed = await loadSnapshot();
  const role = refreshed.roleById.get(params.data.roleId);
  if (!role) {
    res.status(404).json({ error: "Role not found" });
    return;
  }
  res.json(UpdateRoleResponse.parse(refreshed.buildRole(role.id)));
});

router.get("/topics", async (req, res): Promise<void> => {
  const parsed = ListTopicsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const snapshot = await loadSnapshot();
  let topics = snapshot.topics;
  const { status, priority, departmentId, roleId, search, limit } = parsed.data;
  if (status) topics = topics.filter((topic) => topic.status === status);
  if (priority) topics = topics.filter((topic) => topic.priority === priority);
  if (departmentId) topics = topics.filter((topic) => topic.departmentId === departmentId);
  if (roleId) topics = topics.filter((topic) => topic.roleId === roleId);
  if (search) {
    const needle = search.toLowerCase();
    topics = topics.filter(
      (topic) =>
        topic.title.toLowerCase().includes(needle) ||
        topic.description.toLowerCase().includes(needle),
    );
  }
  res.json(ListTopicsResponse.parse(topics.slice(0, limit).map(snapshot.buildTopic)));
});

router.post("/topics", async (req, res): Promise<void> => {
  const parsed = CreateTopicBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const snapshot = await loadSnapshot();
  const role = snapshot.roleById.get(parsed.data.roleId);
  const roleDepartmentIds = snapshot.roleDepartments.filter((entry) => entry.roleId === parsed.data.roleId).map((entry) => entry.departmentId);
  if (!role || ![role.departmentId, ...roleDepartmentIds].includes(parsed.data.departmentId)) {
    res.status(400).json({ error: "Role does not belong to the selected department" });
    return;
  }
  const id = randomUUID();
  const [created] = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(topicsTable)
      .values({
        id,
        title: parsed.data.title,
        description: parsed.data.description,
        departmentId: parsed.data.departmentId,
        roleId: parsed.data.roleId,
        priority: parsed.data.priority,
        creatorId: currentUserId(req),
        primaryAssigneeId: parsed.data.primaryAssigneeId,
        targetDate: dateOnly(parsed.data.targetDate),
        estimatedStartDate: dateOnly(parsed.data.estimatedStartDate),
        estimatedFinishDate: dateOnly(parsed.data.estimatedFinishDate),
        estimatedEffortHours: parsed.data.estimatedEffortHours,
        status: "pending_validation",
      })
      .returning();
    await addActivity(req, id, "Topic created", "Submitted for Service Head validation.", false, tx);
    return rows;
  });
  const refreshed = await loadSnapshot();
  res.status(201).json(CreateTopicResponse.parse(refreshed.buildTopic(created)));
});

router.get("/topics/:topicId", async (req, res): Promise<void> => {
  const params = GetTopicParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const snapshot = await loadSnapshot();
  const topic = snapshot.topics.find((item) => item.id === params.data.topicId);
  if (!topic) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  res.json(GetTopicResponse.parse(snapshot.buildTopicDetail(topic)));
});

router.patch("/topics/:topicId", async (req, res): Promise<void> => {
  const params = UpdateTopicParams.safeParse(req.params);
  const body = UpdateTopicBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid topic update" });
    return;
  }
  const current = await loadSnapshot();
  const currentTopic = current.topics.find((topic) => topic.id === params.data.topicId);
  if (!currentTopic) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  if (!requireTopicManager(req, res, currentTopic, current)) return;
  if (
    currentTopic.status === "pending_validation" &&
    body.data.status !== undefined &&
    body.data.status !== "pending_validation"
  ) {
    res.status(409).json({ error: "Pending topics must use an authorized validation endpoint" });
    return;
  }
  if (
    currentTopic.status !== "pending_validation" &&
    body.data.status === "pending_validation"
  ) {
    res.status(409).json({ error: "Validated topics cannot be reset to pending validation" });
    return;
  }
  const completedAt = body.data.status === "completed" ? new Date() : undefined;
  const [updated] = await db.transaction(async (tx) => {
    const rows = await tx
      .update(topicsTable)
      .set({
        ...body.data,
        estimatedStartDate:
          body.data.estimatedStartDate === undefined ? undefined : dateOnly(body.data.estimatedStartDate),
        estimatedFinishDate:
          body.data.estimatedFinishDate === undefined ? undefined : dateOnly(body.data.estimatedFinishDate),
        estimatedEffortHours: body.data.estimatedEffortHours,
        completedAt,
        updatedAt: new Date(),
      })
      .where(eq(topicsTable.id, params.data.topicId))
      .returning();
    if (rows[0]) {
      await addActivity(req, rows[0].id, "Topic updated", "Topic details or status were updated.", false, tx);
    }
    return rows;
  });
  if (!updated) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  const snapshot = await loadSnapshot();
  res.json(UpdateTopicResponse.parse(snapshot.buildTopic(updated)));
});

router.patch("/topics/:topicId/finish-date", async (req, res): Promise<void> => {
  const params = UpdateTopicFinishDateParams.safeParse(req.params);
  const body = UpdateTopicFinishDateBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "A finish-date note is required" });
    return;
  }
  const before = await loadSnapshot();
  const topic = before.topics.find((item) => item.id === params.data.topicId);
  if (!topic) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  if (!requireTopicManager(req, res, topic, before)) return;
  const targetDate = dateOnly(body.data.targetDate);
  const [updated] = await db.transaction(async (tx) => {
    const rows = await tx
      .update(topicsTable)
      .set({ targetDate, updatedAt: new Date() })
      .where(eq(topicsTable.id, topic.id))
      .returning();
    if (!rows[0]) return rows;
    await tx.insert(topicFinishDateRevisionsTable).values({
      id: randomUUID(),
      topicId: topic.id,
      previousTargetDate: topic.targetDate,
      newTargetDate: targetDate,
      note: body.data.note,
      actorId: currentUserId(req),
    });
    await addActivity(req, topic.id, "Committed finish date changed", body.data.note, false, tx);
    return rows;
  });
  if (!updated) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  const snapshot = await loadSnapshot();
  res.json(UpdateTopicFinishDateResponse.parse(snapshot.buildTopic(updated)));
});

router.get("/topics/:topicId/allocations/:weekStart", async (req, res): Promise<void> => {
  const params = GetTopicAllocationsParams.safeParse({
    ...req.params,
    weekStart: new Date(req.params.weekStart),
  });
  if (!params.success) {
    res.status(400).json({ error: "Invalid topic allocation request" });
    return;
  }
  const snapshot = await loadSnapshot();
  const topic = snapshot.topics.find((item) => item.id === params.data.topicId);
  if (!topic) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  const weekStart = dateOnly(params.data.weekStart);
  if (!weekStart) {
    res.status(400).json({ error: "A valid weekStart is required" });
    return;
  }
  const rows = snapshot.allocations.filter(
    (allocation) => allocation.topicId === topic.id && allocation.weekStart === weekStart,
  );
  res.json(
    GetTopicAllocationsResponse.parse(
      rows.map((allocation) => ({
        topicId: allocation.topicId,
        member: snapshot.memberById.get(allocation.memberId),
        weekStart: allocation.weekStart,
        allocationPercent: allocation.allocationPercent,
      })),
    ),
  );
});

router.put("/topics/:topicId/allocations", async (req, res): Promise<void> => {
  const params = ReplaceTopicAllocationsParams.safeParse(req.params);
  const body = ReplaceTopicAllocationsBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid topic allocations" });
    return;
  }
  const before = await loadSnapshot();
  const topic = before.topics.find((item) => item.id === params.data.topicId);
  if (!topic) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  if (!requireTopicManager(req, res, topic, before)) return;
  const weekStart = dateOnly(body.data.weekStart);
  if (!weekStart) {
    res.status(400).json({ error: "A valid weekStart is required" });
    return;
  }
  const members = new Map(before.members.map((member) => [member.id, member]));
  const collaboratorIds = new Set(
    before.collaborators.filter((item) => item.topicId === topic.id).map((item) => item.memberId),
  );
  const seen = new Set<string>();
  for (const allocation of body.data.allocations) {
    if (seen.has(allocation.memberId)) {
      res.status(400).json({ error: "Duplicate allocation member" });
      return;
    }
    seen.add(allocation.memberId);
    if (!members.has(allocation.memberId)) {
      res.status(400).json({ error: "Allocation member not found" });
      return;
    }
    if (allocation.memberId !== topic.primaryAssigneeId && !collaboratorIds.has(allocation.memberId)) {
      res.status(400).json({ error: "Allocation member must be the primary assignee or a collaborator" });
      return;
    }
  }
  await db.transaction(async (tx) => {
    await tx.delete(topicWeeklyAllocationsTable).where(
      and(eq(topicWeeklyAllocationsTable.topicId, topic.id), eq(topicWeeklyAllocationsTable.weekStart, weekStart)),
    );
    if (body.data.allocations.length) {
      await tx.insert(topicWeeklyAllocationsTable).values(
        body.data.allocations.map((allocation) => ({
          topicId: topic.id,
          memberId: allocation.memberId,
          weekStart,
          allocationPercent: allocation.allocationPercent,
        })),
      );
    }
    await addActivity(req, topic.id, "Weekly allocations replaced", `${weekStart}: ${body.data.allocations.length} member allocations`, false, tx);
  });
  const snapshot = await loadSnapshot();
  res.json(
    ReplaceTopicAllocationsResponse.parse(
      snapshot.allocations
        .filter((allocation) => allocation.topicId === topic.id && allocation.weekStart === weekStart)
        .map((allocation) => ({
          topicId: allocation.topicId,
          member: snapshot.memberById.get(allocation.memberId),
          weekStart: allocation.weekStart,
          allocationPercent: allocation.allocationPercent,
        })),
    ),
  );
});

router.get("/occupancy/overview", async (req, res): Promise<void> => {
  const parsed = GetOccupancyOverviewQueryParams.safeParse({
    ...req.query,
    weekStart: new Date(String(req.query.weekStart ?? "")),
  });
  if (!parsed.success) {
    res.status(400).json({ error: "A valid weekStart is required" });
    return;
  }
  const weekStart = dateOnly(parsed.data.weekStart);
  if (!weekStart) {
    res.status(400).json({ error: "A valid weekStart is required" });
    return;
  }
  const snapshot = await loadSnapshot();
  const overview = snapshot.members
    .filter((member) => member.status === "active")
    .map((member) => {
      const topicRows = snapshot.allocations.filter(
        (allocation) => allocation.memberId === member.id && allocation.weekStart === weekStart,
      );
      const topicAllocationPercent = topicRows.reduce((sum, row) => sum + row.allocationPercent, 0);
      const totalOccupancyPercent = member.dailyBusinessPercent + topicAllocationPercent;
      return {
        member,
        weekStart,
        dailyBusinessPercent: member.dailyBusinessPercent,
        topics: topicRows.map((row) => ({
          topicId: row.topicId,
          title: snapshot.topics.find((topic) => topic.id === row.topicId)?.title ?? "Unknown topic",
          allocationPercent: row.allocationPercent,
        })),
        topicAllocationPercent,
        totalOccupancyPercent,
        availablePercent: 100 - totalOccupancyPercent,
        overAllocated: totalOccupancyPercent > 100,
      };
    });
  res.json(GetOccupancyOverviewResponse.parse(overview));
});

router.post("/topics/:topicId/validate", async (req, res): Promise<void> => {
  const params = ValidateTopicParams.safeParse(req.params);
  const body = ValidateTopicBody.safeParse(req.body ?? {});
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid validation request" });
    return;
  }
  const snapshot = await loadSnapshot();
  const topic = snapshot.topics.find((item) => item.id === params.data.topicId);
  if (!topic) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  const department = snapshot.departmentById.get(topic.departmentId);
  if (
    !department ||
    ![department.serviceHeadId, department.serviceHeadDeputyId].includes(currentUserId(req))
  ) {
    res.status(403).json({ error: "Use break-glass validation outside your scope" });
    return;
  }
  const [updated] = await db.transaction(async (tx) => {
    const [validated] = await tx
      .update(topicsTable)
      .set({
        status: "open",
        validationMode: "standard",
        validationReason: body.data.note,
        validatorId: currentUserId(req),
        validatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(topicsTable.id, topic.id), eq(topicsTable.status, "pending_validation")))
      .returning();
    if (validated) {
      await addActivity(
        req,
        topic.id,
        "Topic validated",
        body.data.note ?? "Validated by service authority.",
        false,
        tx,
      );
    }
    return [validated];
  });
  if (!updated) {
    res.status(409).json({ error: "Topic has already left pending validation" });
    return;
  }
  const refreshed = await loadSnapshot();
  res.json(ValidateTopicResponse.parse(refreshed.buildTopic(updated)));
});

router.post(
  "/topics/:topicId/validation-break-glass",
  breakGlassLimiter,
  async (req, res): Promise<void> => {
  const params = ValidateTopicBreakGlassParams.safeParse(req.params);
  const body = ValidateTopicBreakGlassBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "A detailed break-glass explanation is required" });
    return;
  }
  const snapshotBefore = await loadSnapshot();
  if (!requireCapability(req, res, snapshotBefore, "validation.break_glass")) return;
  const topic = snapshotBefore.topics.find((item) => item.id === params.data.topicId);
  if (!topic) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  const authorityDepartment = snapshotBefore.departmentById.get(topic.departmentId);
  if (
    authorityDepartment &&
    [authorityDepartment.serviceHeadId, authorityDepartment.serviceHeadDeputyId].includes(
      currentUserId(req),
    )
  ) {
    res.status(400).json({ error: "Use standard validation inside your assigned scope" });
    return;
  }
  const recipients = authorityDepartment
    ? [
        authorityDepartment.serviceHeadId,
        authorityDepartment.serviceHeadDeputyId,
      ]
        .filter(Boolean)
        .map((id) => snapshotBefore.memberById.get(id as string)?.email)
        .filter(Boolean) as string[]
    : [];
  const [updated] = await db.transaction(async (tx) => {
    const [validated] = await tx
      .update(topicsTable)
      .set({
        status: "open",
        validationMode: "break_glass",
        validationReason: body.data.reason,
        validatorId: currentUserId(req),
        validatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(topicsTable.id, params.data.topicId),
          eq(topicsTable.status, "pending_validation"),
        ),
      )
      .returning();
    if (!validated) return [undefined];
    await addActivity(
      req,
      validated.id,
      "Break-glass validation",
      `${body.data.reason} Responsible authority notification queued.`,
      true,
      tx,
    );
    for (const recipient of recipients) {
      await queueMail(tx, {
        topicId: validated.id,
        recipient,
        subject: `QueueCraft break-glass validation: ${validated.title}`,
        body: `A validation-only break-glass action was used for "${validated.title}".\n\nReason: ${body.data.reason}\n\nValidator: ${snapshotBefore.memberById.get(currentUserId(req))?.name ?? currentUserId(req)}`,
      });
    }
    return [validated];
  });
  if (!updated) {
    res.status(409).json({ error: "Topic has already left pending validation" });
    return;
  }
  req.log.warn(
    { topicId: updated.id, departmentId: updated.departmentId },
    "Break-glass validation used; responsible authority notification queued",
  );
  const snapshot = await loadSnapshot();
  res.json(ValidateTopicBreakGlassResponse.parse(snapshot.buildTopic(updated)));
  },
);

router.post("/topics/:topicId/assign", async (req, res): Promise<void> => {
  const params = AssignTopicParams.safeParse(req.params);
  const body = AssignTopicBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid assignment" });
    return;
  }
  const before = await loadSnapshot();
  const topic = before.topics.find((item) => item.id === params.data.topicId);
  if (!topic) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  if (!requireTopicManager(req, res, topic, before)) return;
  if (topic.status === "pending_validation") {
    res.status(409).json({ error: "A topic must be validated before assignment" });
    return;
  }
  if (!before.memberById.has(body.data.memberId)) {
    res.status(400).json({ error: "Assignee not found" });
    return;
  }
  const [updated] = await db.transaction(async (tx) => {
    const rows = await tx
      .update(topicsTable)
      .set({ primaryAssigneeId: body.data.memberId, status: "in_progress", updatedAt: new Date() })
      .where(
        and(
          eq(topicsTable.id, params.data.topicId),
          ne(topicsTable.status, "pending_validation"),
        ),
      )
      .returning();
    if (rows[0]) {
      await addActivity(req, rows[0].id, "Primary assignee changed", "Accountable owner updated.", false, tx);
    }
    return rows;
  });
  if (!updated) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  const snapshot = await loadSnapshot();
  res.json(AssignTopicResponse.parse(snapshot.buildTopic(updated)));
});

router.post("/topics/:topicId/collaborators", async (req, res): Promise<void> => {
  const params = AddTopicCollaboratorParams.safeParse(req.params);
  const body = AddTopicCollaboratorBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid collaborator" });
    return;
  }
  const before = await loadSnapshot();
  const existingTopic = before.topics.find((item) => item.id === params.data.topicId);
  if (!existingTopic) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  if (!requireTopicManager(req, res, existingTopic, before)) return;
  if (!before.memberById.has(body.data.memberId)) {
    res.status(400).json({ error: "Collaborator not found" });
    return;
  }
  if (before.collaborators.some((collaborator) => collaborator.topicId === existingTopic.id && collaborator.memberId === body.data.memberId)) {
    res.status(409).json({ error: "Member is already a collaborator on this topic" });
    return;
  }
  if (
    body.data.milestoneIds?.some(
      (id) => !before.milestones.some((milestone) => milestone.id === id && milestone.topicId === existingTopic.id),
    )
  ) {
    res.status(400).json({ error: "A collaborator milestone does not belong to this topic" });
    return;
  }
  const id = randomUUID();
  const [created] = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(topicCollaboratorsTable)
      .values({ id, topicId: params.data.topicId, memberId: body.data.memberId })
      .returning();
    if (body.data.milestoneIds?.length) {
      await tx.insert(collaboratorMilestonesTable).values(
        body.data.milestoneIds.map((milestoneId) => ({ collaboratorId: id, milestoneId })),
      );
    }
    await addActivity(req, params.data.topicId, "Collaborator added", "Topic-scoped access granted.", false, tx);
    return rows;
  });
  const snapshot = await loadSnapshot();
  const collaborator = snapshot.collaborators.find((item) => item.id === created.id);
  const topic = snapshot.topics.find((item) => item.id === params.data.topicId);
  if (!collaborator || !topic) throw new Error("Created collaborator could not be loaded");
  const built = snapshot.buildTopic(topic).collaborators?.find((item) => item.id === created.id);
  res.status(201).json(AddTopicCollaboratorResponse.parse(built));
});

router.post("/topics/:topicId/milestones", async (req, res): Promise<void> => {
  const params = AddTopicMilestoneParams.safeParse(req.params);
  const body = AddTopicMilestoneBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid milestone" });
    return;
  }
  const before = await loadSnapshot();
  const topic = before.topics.find((item) => item.id === params.data.topicId);
  if (!topic) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  if (!requireTopicManager(req, res, topic, before)) return;
  const [created] = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(milestonesTable)
      .values({
        id: randomUUID(),
        topicId: params.data.topicId,
        title: body.data.title,
        description: body.data.description,
        targetDate: dateOnly(body.data.targetDate),
        assigneeId: body.data.assigneeId,
      })
      .returning();
    await addActivity(req, params.data.topicId, "Milestone added", rows[0].title, false, tx);
    return rows;
  });
  const snapshot = await loadSnapshot();
  res.status(201).json(AddTopicMilestoneResponse.parse(snapshot.buildMilestone(created)));
});

router.patch("/milestones/:milestoneId", async (req, res): Promise<void> => {
  const params = UpdateMilestoneParams.safeParse(req.params);
  const body = UpdateMilestoneBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid milestone update" });
    return;
  }
  const before = await loadSnapshot();
  const existingMilestone = before.milestones.find(
    (milestone) => milestone.id === params.data.milestoneId,
  );
  const topic = existingMilestone
    ? before.topics.find((item) => item.id === existingMilestone.topicId)
    : undefined;
  if (!existingMilestone || !topic) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }
  if (!requireTopicManager(req, res, topic, before)) return;
  const completedAt = body.data.status === "completed" ? new Date() : undefined;
  const [updated] = await db.transaction(async (tx) => {
    const rows = await tx
      .update(milestonesTable)
      .set({
        ...body.data,
        targetDate:
          body.data.targetDate === undefined ? undefined : dateOnly(body.data.targetDate),
        completedAt,
      })
      .where(eq(milestonesTable.id, params.data.milestoneId))
      .returning();
    if (rows[0]) {
      await addActivity(req, rows[0].topicId, "Milestone updated", `${rows[0].title}: ${rows[0].status}`, false, tx);
    }
    return rows;
  });
  if (!updated) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }
  const snapshot = await loadSnapshot();
  res.json(UpdateMilestoneResponse.parse(snapshot.buildMilestone(updated)));
});

router.delete("/milestones/:milestoneId", async (req, res): Promise<void> => {
  const params = DeleteMilestoneParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid milestone" });
    return;
  }
  const before = await loadSnapshot();
  const milestone = before.milestones.find((item) => item.id === params.data.milestoneId);
  const topic = milestone ? before.topics.find((item) => item.id === milestone.topicId) : undefined;
  if (!milestone || !topic) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }
  if (!requireTopicManager(req, res, topic, before)) return;
  await db.transaction(async (tx) => {
    await tx.delete(collaboratorMilestonesTable).where(eq(collaboratorMilestonesTable.milestoneId, milestone.id));
    await tx.delete(milestonesTable).where(eq(milestonesTable.id, milestone.id));
    await addActivity(req, topic.id, "Milestone deleted", milestone.title, false, tx);
  });
  res.sendStatus(204);
});

router.get("/validation-queue", async (req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  const responsibleDepartmentIds = snapshot.departments
    .filter((department) =>
      [department.serviceHeadId, department.serviceHeadDeputyId].includes(currentUserId(req)),
    )
    .map((department) => department.id);
  const queue = snapshot.topics.filter(
    (topic) =>
      topic.status === "pending_validation" &&
      responsibleDepartmentIds.includes(topic.departmentId),
  );
  res.json(GetValidationQueueResponse.parse(queue.map(snapshot.buildTopic)));
});

router.get("/my-work", async (req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  const builtTopics = snapshot.topics.map(snapshot.buildTopic);
  const collaboratedTopicIds = new Set(
    snapshot.collaborators
      .filter((entry) => entry.memberId === currentUserId(req))
      .map((entry) => entry.topicId),
  );
  const responsibleDepartmentIds = snapshot.departments
    .filter((department) =>
      [department.serviceHeadId, department.serviceHeadDeputyId].includes(currentUserId(req)),
    )
    .map((department) => department.id);
  res.json(
    GetMyWorkResponse.parse({
      created: builtTopics.filter((topic) => topic.creator.id === currentUserId(req)),
      assigned: builtTopics.filter((topic) => topic.primaryAssignee?.id === currentUserId(req)),
      milestones: snapshot.milestones
        .filter((milestone) => milestone.assigneeId === currentUserId(req))
        .map(snapshot.buildMilestone),
      collaborations: builtTopics.filter((topic) => collaboratedTopicIds.has(topic.id)),
      validationQueue: builtTopics.filter(
        (topic) =>
          topic.status === "pending_validation" &&
          responsibleDepartmentIds.includes(topic.department.id),
      ),
    }),
  );
});

router.get("/dashboard/activity", async (req, res): Promise<void> => {
  const parsed = GetDashboardActivityQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const snapshot = await loadSnapshot();
  res.json(
    GetDashboardActivityResponse.parse(
      snapshot.activities.slice(0, parsed.data.limit).map(snapshot.buildActivity),
    ),
  );
});

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  const now = new Date();
  const grouped = (labels: string[], value: (topic: (typeof snapshot.topics)[number]) => string) =>
    labels.map((label) => ({
      label,
      count: snapshot.topics.filter((topic) => value(topic) === label).length,
      color: null,
    }));
  const departmentNames = snapshot.departments.map((department) => department.name);
  const roleNames = snapshot.roles.map((role) => role.name);
  res.json(
    GetDashboardSummaryResponse.parse({
      kpis: {
        total: snapshot.topics.length,
        pendingValidation: snapshot.topics.filter(
          (topic) => topic.status === "pending_validation",
        ).length,
        inProgress: snapshot.topics.filter((topic) => topic.status === "in_progress").length,
        completed: snapshot.topics.filter((topic) =>
          ["completed", "closed"].includes(topic.status),
        ).length,
        overdue: snapshot.topics.filter(
          (topic) =>
            topic.targetDate &&
            new Date(topic.targetDate) < now &&
            !["completed", "closed", "rejected"].includes(topic.status),
        ).length,
        unassigned: snapshot.topics.filter((topic) => !topic.primaryAssigneeId).length,
      },
      statusCounts: grouped(
        ["pending_validation", "open", "in_progress", "completed", "closed"],
        (topic) => topic.status,
      ),
      priorityCounts: grouped(["P1", "P2", "P3", "P4"], (topic) => topic.priority),
      departmentCounts: departmentNames.map((label) => ({
        label,
        count: snapshot.topics.filter(
          (topic) => snapshot.departmentById.get(topic.departmentId)?.name === label,
        ).length,
        color: null,
      })),
      roleCounts: roleNames.map((label) => ({
        label,
        count: snapshot.topics.filter(
          (topic) => snapshot.roleById.get(topic.roleId)?.name === label,
        ).length,
        color: null,
      })),
    }),
  );
});

export default router;