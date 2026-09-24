import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
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
  notificationRulesTable,
  notificationOutboxTable,
  topicCollaboratorsTable,
  topicFinishDateRevisionsTable,
  topicAllocationsTable,
  topicsTable,
} from "@workspace/db";
import { hashLocalPassword } from "../services/local-password";
import {
  AddTopicCollaboratorBody,
  AddTopicCollaboratorParams,
  AddTopicCollaboratorResponse,
  DeleteTopicCollaboratorParams,
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
  DeleteTopicParams,
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
  UpdateMemberPermissionsBody,
  ResetLocalMemberPasswordBody,
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
import { authLimiter, breakGlassLimiter } from "../middleware/security";
import { queueMail, sendTestMail } from "../services/mailer";
import {
  getRuntimeSettings,
  maskedStatus,
  updateRuntimeSettings,
  type RuntimeSettings,
} from "../services/application-settings";
import { clearOidcConfigurationCache } from "../services/oidc";
import { httpsCertificateStatus, installHttpsCertificate, validateHttpsCertificate } from "../services/https-certificate";
import { searchLdapsUsers } from "../services/ldaps";
import {
  enqueueRuleNotifications,
  NOTIFICATION_ACTIONS,
} from "../services/notifications";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  exportBackup,
  restoreBackup,
} from "../services/backup";

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
    db.select().from(topicAllocationsTable),
    db
      .select()
      .from(topicFinishDateRevisionsTable)
      .orderBy(desc(topicFinishDateRevisionsTable.createdAt)),
  ]);

  const memberById = new Map(members.map((member) => [member.id, member]));
  const departmentById = new Map(
    departments.map((department) => [department.id, department]),
  );
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const member = (id: string | null) =>
    id ? (memberById.get(id) ?? null) : null;

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
      departmentIds: [
        ...new Set([
          role.departmentId,
          ...roleDepartments
            .filter((entry) => entry.roleId === id)
            .map((entry) => entry.departmentId),
        ]),
      ],
      lead,
      deputy: member(role.deputyId),
      memberCount: roleMembers.filter((entry) => entry.roleId === id).length,
      memberIds: roleMembers
        .filter((entry) => entry.roleId === id)
        .map((entry) => entry.memberId),
    };
  };

  const buildMilestone = (milestone: (typeof milestones)[number]) => ({
    id: milestone.id,
    title: milestone.title,
    description: milestone.description,
    status: milestone.status,
    beginDate: milestone.beginDate,
    targetDate: milestone.targetDate,
    assignee: member(milestone.assigneeId),
    workloadPercent: milestone.workloadPercent,
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
    const topicMilestones = milestones.filter(
      (milestone) => milestone.topicId === topic.id,
    );
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
          if (!collaboratorMember)
            throw new Error(`Collaborator ${collaborator.memberId} not found`);
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
  await enqueueRuleNotifications(executor, {
    action,
    topicId,
    detail,
    isBreakGlass,
  });
}

export function getCapabilities(
  userId: string,
  snapshot: Awaited<ReturnType<typeof loadSnapshot>>,
  authProvider?: string,
) {
  const user = snapshot.memberById.get(userId);
  const isServiceAuthority = snapshot.departments.some((department) =>
    [department.serviceHeadId, department.serviceHeadDeputyId].includes(userId),
  );
  const isRoleAuthority = snapshot.roles.some((role) =>
    [role.leadId, role.deputyId].includes(userId),
  );
  const isLocalAdmin = userId === "local-admin" && authProvider === "local";
  const canAssignAuthorities = isLocalAdmin || isServiceAuthority || Boolean(user?.isCio);
  const capabilities = ["topic.create", "topic.edit", "topic.assign"];
  if (isServiceAuthority)
    capabilities.push(
      "validation.approve",
      "topic.delete",
    );
  if (canAssignAuthorities)
    capabilities.push("directory.manage", "directory.manage_cio", "settings.manage");
  if (isServiceAuthority || user?.isCio)
    capabilities.push("validation.break_glass");
  if (isLocalAdmin) capabilities.push("local_password.reset", "settings.recovery", "topic.delete");
  if (isRoleAuthority) capabilities.push("role.execute");
  return [...new Set(capabilities)];
}

function requireCapability(
  req: Request,
  res: Response,
  snapshot: Awaited<ReturnType<typeof loadSnapshot>>,
  capability: string,
) {
  if (!getCapabilities(currentUserId(req), snapshot, req.session.authProvider).includes(capability)) {
    res.status(403).json({ error: `Missing capability: ${capability}` });
    return false;
  }
  return true;
}

function canManageTopic(
  userId: string,
  topic: Awaited<ReturnType<typeof loadSnapshot>>["topics"][number],
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
    [department?.serviceHeadId, department?.serviceHeadDeputyId].includes(
      userId,
    ),
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
  topic: Awaited<ReturnType<typeof loadSnapshot>>["topics"][number],
  snapshot: Awaited<ReturnType<typeof loadSnapshot>>,
) {
  if (!canManageTopic(currentUserId(req), topic, snapshot)) {
    res
      .status(403)
      .json({ error: "You do not have management access to this topic" });
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
      authProvider: req.session.authProvider ?? null,
      capabilities: getCapabilities(user.id, snapshot, req.session.authProvider),
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

router.get("/admin/settings/https", async (req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  if (!requireCapability(req, res, snapshot, "settings.manage")) return;
  res.setHeader("Cache-Control", "no-store");
  res.json(httpsCertificateStatus(await getRuntimeSettings()));
});

router.put("/admin/settings/https", async (req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  if (!requireCapability(req, res, snapshot, "settings.manage")) return;
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      (body.clearChain !== undefined && typeof body.clearChain !== "boolean") ||
      ["certificatePem", "privateKeyPem", "chainPem"].some(
        (field) => body[field] !== undefined && typeof body[field] !== "string",
      )) {
    res.status(400).json({ error: "Certificate, key, and chain must be PEM text." });
    return;
  }
  const current = await getRuntimeSettings();
  let pair: ReturnType<typeof validateHttpsCertificate>;
  try {
    pair = validateHttpsCertificate(body, current);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid HTTPS certificate." });
    return;
  }
  const saved = await db.transaction(async (tx) => {
    const updated = await updateRuntimeSettings({
      httpsCertificatePem: pair.certificatePem,
      httpsPrivateKeyPem: pair.privateKeyPem,
      httpsChainPem: pair.chainPem,
    }, currentUserId(req), tx);
    await addActivity(req, null, "HTTPS certificate updated", "HTTPS certificate configuration saved", false, tx);
    return updated;
  });
  try {
    const installed = await installHttpsCertificate(saved, true);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ...httpsCertificateStatus(saved), installed });
  } catch (error) {
    req.log.error({ err: error }, "HTTPS certificate installation failed");
    res.status(500).json({ error: "Certificate saved but could not be installed on the HTTPS listener. Check the shared certificate volume and server logs." });
  }
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
    "publicBaseUrl",
    "adfsEnabled",
    "adfsDisplayName",
    "adfsIssuer",
    "adfsDiscoveryUrl",
    "adfsClientId",
    "adfsClientSecret",
    "adfsRedirectUri",
    "adfsScopes",
    "adfsUsernameClaim",
    "adfsEmailClaim",
    "adfsDisplayNameClaim",
    "adfsCaCertificate",
    "ldapsUrl",
    "ldapsBindDn",
    "ldapsBindPassword",
    "ldapsBaseDn",
    "ldapsUserFilter",
    "ldapsCaCertificate",
    "ldapsCioGroupDn",
    "smtpHost",
    "smtpPort",
    "smtpSecure",
    "smtpUser",
    "smtpPassword",
    "smtpFrom",
    "smtpFromName",
  ]);
  const update: Partial<RuntimeSettings> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!allowed.has(key as keyof RuntimeSettings)) continue;
    if (key === "smtpPort") {
      if (
        !Number.isInteger(value) ||
        Number(value) < 1 ||
        Number(value) > 65535
      ) {
        res
          .status(400)
          .json({ error: "SMTP port must be between 1 and 65535" });
        return;
      }
      update.smtpPort = Number(value);
    } else if (key === "smtpSecure" || key === "adfsEnabled") {
      if (typeof value !== "boolean") {
        res.status(400).json({ error: "SMTP secure must be a boolean" });
        return;
      }
      if (key === "smtpSecure") update.smtpSecure = value;
      else update.adfsEnabled = value;
    } else if (typeof value === "string") {
      (update as Record<string, string>)[key] = value.trim();
    } else {
      res.status(400).json({ error: `Invalid value for ${key}` });
      return;
    }
  }
  const changedFields = Object.entries(update)
    .filter(([, value]) => value !== "")
    .map(([key]) => key)
    .sort();
  const saved = await db.transaction(async (tx) => {
    const result = await updateRuntimeSettings(update, currentUserId(req), tx);
    await addActivity(
      req,
      null,
      "Application settings updated",
      `Changed fields: ${changedFields.join(", ") || "none"}`,
      false,
      tx,
    );
    return result;
  });
  clearOidcConfigurationCache();
  res.setHeader("Cache-Control", "no-store");
  res.json(maskedStatus(saved));
});

router.delete("/admin/sessions/:memberId", async (req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  if (!requireCapability(req, res, snapshot, "directory.manage")) return;
  const member = snapshot.memberById.get(req.params.memberId);
  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const deleted = await tx.execute(sql`
      DELETE FROM user_sessions
      WHERE sess ->> 'userId' = ${member.id}
    `);
    await addActivity(
      req,
      null,
      "Member sessions revoked",
      `Sessions revoked for ${member.email}`,
      false,
      tx,
    );
    return deleted.rowCount ?? 0;
  });
  res.json({ revoked: result });
});

router.get("/admin/backup", async (req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  if (!requireCapability(req, res, snapshot, "settings.recovery")) return;
  await db.insert(auditLogTable).values({
    id: randomUUID(),
    actorId: currentUserId(req),
    action: "Backup exported",
    resourceType: "system",
    requestId: String(req.id),
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
    details: { tableCount: 16 },
    isBreakGlass: false,
  });
  const backup = await exportBackup();
  res.type("application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="queuecraft-backup-${new Date().toISOString().slice(0, 10)}.json"`,
  );
  res.json(backup);
});

router.post("/admin/backup/restore", async (req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  if (!requireCapability(req, res, snapshot, "settings.recovery")) return;
  try {
    await restoreBackup(req.body, {
      id: randomUUID(),
      actorId: currentUserId(req),
      action: "Backup restored",
      resourceType: "system",
      requestId: String(req.id),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: { format: BACKUP_FORMAT, version: BACKUP_VERSION },
      isBreakGlass: false,
    });
    res.json({ restored: true });
  } catch (error) {
    res
      .status(400)
      .json({
        error: error instanceof Error ? error.message : "Backup restore failed",
      });
  }
});

router.get("/admin/notification-rules", async (req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  if (!requireCapability(req, res, snapshot, "settings.manage")) return;
  const rules = await db.select().from(notificationRulesTable);
  res.json(rules);
});

router.put(
  "/admin/notification-rules/:ruleId",
  async (req, res): Promise<void> => {
    const snapshot = await loadSnapshot();
    if (!requireCapability(req, res, snapshot, "settings.manage")) return;
    const { ruleId } = req.params;
    const action = req.body?.action;
    const enabled = req.body?.enabled;
    if (
      !NOTIFICATION_ACTIONS.includes(action) ||
      typeof enabled !== "boolean"
    ) {
      res.status(400).json({ error: "Action and enabled are required" });
      return;
    }
    const [duplicate] = await db
      .select({ id: notificationRulesTable.id })
      .from(notificationRulesTable)
      .where(and(eq(notificationRulesTable.action, action), ne(notificationRulesTable.id, ruleId)))
      .limit(1);
    if (duplicate) {
      res.status(409).json({ error: "A notification rule already exists for this topic action" });
      return;
    }
    const [rule] = await db
      .insert(notificationRulesTable)
      .values({ id: ruleId, action, enabled })
      .onConflictDoUpdate({
        target: notificationRulesTable.id,
        set: { action, enabled, updatedAt: new Date() },
      })
      .returning();
    res.json(rule);
  },
);

router.post("/admin/settings/test-email", async (req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  if (!requireCapability(req, res, snapshot, "settings.manage")) return;
  const recipient = typeof req.body?.recipient === "string" ? req.body.recipient.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    res.status(400).json({ error: "A valid recipient email address is required" });
    return;
  }
  try {
    await sendTestMail(recipient);
    res.json({ sent: true });
  } catch (error) {
    req.log.error({ err: error }, "SMTP test email failed");
    res.status(502).json({ error: error instanceof Error ? error.message : "SMTP test email failed" });
  }
});

router.delete(
  "/admin/notification-rules/:ruleId",
  async (req, res): Promise<void> => {
    const snapshot = await loadSnapshot();
    if (!requireCapability(req, res, snapshot, "settings.manage")) return;
    await db
      .delete(notificationRulesTable)
      .where(eq(notificationRulesTable.id, req.params.ruleId));
    res.status(204).end();
  },
);

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
  res.json(
    ListMembersResponse.parse(
      snapshot.members.filter((member) => member.status === "active"),
    ),
  );
});

router.post("/directory/members", async (req, res): Promise<void> => {
  const body = CreateMemberBody.safeParse(req.body);
  const snapshot = await loadSnapshot();
  if (!requireCapability(req, res, snapshot, "directory.manage")) return;
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (body.data.password && body.data.externalSubject) {
    res.status(400).json({ error: "Local accounts cannot have an external identity subject." });
    return;
  }
  const headIds = new Set(body.data.headDepartmentIds ?? []);
  const deputyIds = new Set(body.data.deputyDepartmentIds ?? []);
  if (
    [...headIds, ...deputyIds].some((id) => !snapshot.departmentById.has(id)) ||
    [...headIds].some((id) => deputyIds.has(id))
  ) {
    res.status(400).json({ error: "Select valid departments; a member cannot be both Head and Deputy of one department." });
    return;
  }
  const passwordHash = body.data.password ? await hashLocalPassword(body.data.password) : null;
  if (
    body.data.isCio &&
    !getCapabilities(currentUserId(req), snapshot, req.session.authProvider).includes(
      "directory.manage_cio",
    )
  ) {
    res.status(403).json({ error: "You do not have permission to grant CIO authority" });
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
        authProvider: body.data.password ? "local" : null,
        passwordHash,
        isCio: body.data.isCio,
        cioOverride: body.data.isCio ? true : null,
      })
      .returning();
    for (const department of snapshot.departments) {
      const changes: { serviceHeadId?: string; serviceHeadDeputyId?: string } = {};
      if (headIds.has(department.id)) changes.serviceHeadId = rows[0].id;
      if (deputyIds.has(department.id)) changes.serviceHeadDeputyId = rows[0].id;
      if (Object.keys(changes).length)
        await tx.update(departmentsTable).set(changes).where(eq(departmentsTable.id, department.id));
    }
    await addActivity(
      req,
      null,
      "Directory member created",
      rows[0].email,
      false,
      tx,
    );
    return rows;
  });
  res.status(201).json(CreateMemberResponse.parse(created));
});

router.put("/directory/members/:memberId/permissions", async (req, res): Promise<void> => {
  const body = UpdateMemberPermissionsBody.safeParse(req.body);
  const snapshot = await loadSnapshot();
  if (!requireCapability(req, res, snapshot, "directory.manage")) return;
  const memberId = Array.isArray(req.params.memberId) ? req.params.memberId[0] : req.params.memberId;
  const member = snapshot.memberById.get(memberId);
  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  if (member.id === "local-admin") {
    res.status(403).json({ error: "The bootstrap administrator's authority cannot be changed." });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: "Invalid permission assignments" });
    return;
  }
  const headIds = new Set(body.data.headDepartmentIds);
  const deputyIds = new Set(body.data.deputyDepartmentIds);
  if (
    [...headIds, ...deputyIds].some((id) => !snapshot.departmentById.has(id)) ||
    [...headIds].some((id) => deputyIds.has(id))
  ) {
    res.status(400).json({ error: "Select valid departments; a member cannot be both Head and Deputy of one department." });
    return;
  }
  if (snapshot.departments.some((department) =>
    department.serviceHeadId === memberId && !headIds.has(department.id)
  )) {
    res.status(400).json({ error: "Assign a replacement Service Head in the department editor before removing this Head." });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.update(membersTable)
      .set({
        isCio: body.data.isCio,
        cioOverride: member.isCio === body.data.isCio ? member.cioOverride : body.data.isCio,
      })
      .where(eq(membersTable.id, memberId));
    for (const department of snapshot.departments) {
      const changes: { serviceHeadId?: string; serviceHeadDeputyId?: string | null } = {};
      if (headIds.has(department.id) && department.serviceHeadId !== memberId)
        changes.serviceHeadId = memberId;
      if (deputyIds.has(department.id) && department.serviceHeadDeputyId !== memberId)
        changes.serviceHeadDeputyId = memberId;
      if (!deputyIds.has(department.id) && department.serviceHeadDeputyId === memberId)
        changes.serviceHeadDeputyId = null;
      if (Object.keys(changes).length)
        await tx.update(departmentsTable).set(changes).where(eq(departmentsTable.id, department.id));
    }
    await addActivity(req, null, "Member permissions updated", member.email, false, tx);
  });
  const refreshed = await loadSnapshot();
  res.json(UpdateMemberResponse.parse(refreshed.memberById.get(memberId)));
});

router.put("/directory/members/:memberId/password", authLimiter, async (req, res): Promise<void> => {
  const body = ResetLocalMemberPasswordBody.safeParse(req.body);
  const snapshot = await loadSnapshot();
  if (!requireCapability(req, res, snapshot, "local_password.reset")) return;
  const memberId = Array.isArray(req.params.memberId) ? req.params.memberId[0] : req.params.memberId;
  const member = snapshot.memberById.get(memberId);
  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  if (member.authProvider !== "local" || member.id === currentUserId(req)) {
    res.status(400).json({ error: "Reset another local member's password here; change your own password from your profile." });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: "Password must be 12–256 characters." });
    return;
  }
  const passwordHash = await hashLocalPassword(body.data.password);
  await db.transaction(async (tx) => {
    await tx.update(membersTable).set({ passwordHash }).where(eq(membersTable.id, member.id));
    await tx.execute(sql`DELETE FROM user_sessions WHERE sess ->> 'userId' = ${member.id}`);
    await addActivity(req, null, "Local member password reset", member.email, false, tx);
  });
  res.status(204).end();
});

router.get("/directory/ldap-users", async (req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  if (!requireCapability(req, res, snapshot, "directory.manage")) return;
  try {
    res.json(
      await searchLdapsUsers(
        typeof req.query.search === "string" ? req.query.search : "",
      ),
    );
  } catch (error) {
    res
      .status(400)
      .json({
        error:
          error instanceof Error
            ? error.message
            : "Active Directory search failed",
      });
  }
});

router.post("/directory/ldap-users/import", async (req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  if (!requireCapability(req, res, snapshot, "directory.manage")) return;
  const users = Array.isArray(req.body?.users) ? req.body.users : [];
  const imported = [];
  for (const user of users) {
    if (
      typeof user?.email !== "string" ||
      typeof user?.name !== "string" ||
      typeof user?.subject !== "string"
    )
      continue;
    const existing = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.email, user.email.toLowerCase()))
      .limit(1);
    if (existing[0]) {
      if (existing[0].authProvider === "local") continue;
      if (existing[0].status === "disabled") {
        const [reactivated] = await db
          .update(membersTable)
          .set({
            status: "active",
            externalSubject: user.subject,
            authProvider: "ldaps",
            name: user.name.trim(),
            initials: initials(user.name),
          })
          .where(eq(membersTable.id, existing[0].id))
          .returning();
        imported.push(reactivated);
      }
      continue;
    }
    const [member] = await db
      .insert(membersTable)
      .values({
        id: randomUUID(),
        name: user.name.trim(),
        initials: initials(user.name),
        email: user.email.toLowerCase(),
        externalSubject: user.subject,
        authProvider: "ldaps",
        status: "active",
      })
      .returning();
    imported.push(member);
  }
  res.status(201).json({ imported: imported.length });
});

router.patch(
  "/directory/members/:memberId",
  async (req, res): Promise<void> => {
    const params = UpdateMemberParams.safeParse(req.params);
    const body = UpdateMemberBody.safeParse(req.body);
    const snapshot = await loadSnapshot();
    if (!requireCapability(req, res, snapshot, "directory.manage")) return;
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid member update" });
      return;
    }
    const existingMember = snapshot.memberById.get(params.data.memberId);
    if (!existingMember) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    if (existingMember.id === "local-admin" &&
      (currentUserId(req) !== "local-admin" || body.data.status === "disabled" || body.data.isCio === false)) {
      res.status(403).json({ error: "The bootstrap administrator cannot be disabled or demoted." });
      return;
    }
    const { headDepartmentIds, deputyDepartmentIds, ...memberChanges } = body.data;
    const hasLeadershipChanges = headDepartmentIds !== undefined || deputyDepartmentIds !== undefined;
    const headIds = new Set(headDepartmentIds ?? []);
    const deputyIds = new Set(deputyDepartmentIds ?? []);
    if (hasLeadershipChanges && (
      headDepartmentIds === undefined ||
      deputyDepartmentIds === undefined ||
      [...headIds, ...deputyIds].some((id) => !snapshot.departmentById.has(id)) ||
      [...headIds].some((id) => deputyIds.has(id)) ||
      snapshot.departments.some((department) =>
        department.serviceHeadId === existingMember.id && !headIds.has(department.id)
      )
    )) {
      res.status(400).json({ error: "Assign a replacement Head in the department editor before removing a current Head." });
      return;
    }
    if (
      body.data.isCio !== undefined &&
      body.data.isCio !== existingMember.isCio &&
      !getCapabilities(currentUserId(req), snapshot, req.session.authProvider).includes(
        "directory.manage_cio",
      )
    ) {
      res.status(403).json({ error: "You do not have permission to change CIO authority" });
      return;
    }
    const [updated] = await db.transaction(async (tx) => {
      const rows = await tx
        .update(membersTable)
        .set({
          ...memberChanges,
          ...(body.data.isCio !== undefined &&
          body.data.isCio !== existingMember.isCio
            ? { cioOverride: body.data.isCio }
            : {}),
          email: body.data.email?.toLowerCase(),
          initials: body.data.name ? initials(body.data.name) : undefined,
        })
        .where(eq(membersTable.id, params.data.memberId))
        .returning();
      if (rows[0]) {
        if (hasLeadershipChanges) {
          for (const department of snapshot.departments) {
            const changes: { serviceHeadId?: string; serviceHeadDeputyId?: string | null } = {};
            if (headIds.has(department.id) && department.serviceHeadId !== existingMember.id)
              changes.serviceHeadId = existingMember.id;
            if (deputyIds.has(department.id) && department.serviceHeadDeputyId !== existingMember.id)
              changes.serviceHeadDeputyId = existingMember.id;
            if (!deputyIds.has(department.id) && department.serviceHeadDeputyId === existingMember.id)
              changes.serviceHeadDeputyId = null;
            if (Object.keys(changes).length)
              await tx.update(departmentsTable).set(changes).where(eq(departmentsTable.id, department.id));
          }
        }
        await addActivity(
          req,
          null,
          "Directory member updated",
          rows[0].email,
          false,
          tx,
        );
      }
      return rows;
    });
    if (!updated) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    res.json(UpdateMemberResponse.parse(updated));
  },
);

router.delete(
  "/directory/members/:memberId",
  async (req, res): Promise<void> => {
    const memberId = req.params.memberId;
    const snapshot = await loadSnapshot();
    if (!requireCapability(req, res, snapshot, "directory.manage")) return;
    if (memberId === currentUserId(req) || memberId === "local-admin") {
      res
        .status(409)
        .json({
          error: "You cannot delete the account used by your current session.",
        });
      return;
    }
    const member = snapshot.memberById.get(memberId);
    if (!member || member.status !== "active") {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    const departmentReference = snapshot.departments.some(
      (department) =>
        department.serviceHeadId === memberId ||
        department.serviceHeadDeputyId === memberId,
    );
    const roleReference = snapshot.roles.some(
      (role) => role.leadId === memberId || role.deputyId === memberId,
    );
    if (departmentReference || roleReference) {
      res
        .status(409)
        .json({
          error:
            "Reassign this member's department or role leadership responsibilities before deleting them.",
        });
      return;
    }
    await db.transaction(async (tx) => {
      await tx
        .delete(roleMembersTable)
        .where(eq(roleMembersTable.memberId, memberId));
      await tx
        .update(membersTable)
        .set({ status: "disabled", externalSubject: null })
        .where(eq(membersTable.id, memberId));
      await tx.execute(sql`
      DELETE FROM user_sessions
      WHERE sess ->> 'userId' = ${memberId}
    `);
      await addActivity(
        req,
        null,
        "Directory member deleted",
        member.email,
        false,
        tx,
      );
    });
    res.status(204).end();
  },
);

router.get("/directory/departments", async (_req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  res.json(
    ListDepartmentsResponse.parse(
      snapshot.departments.map((department) =>
        snapshot.buildDepartment(department.id),
      ),
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
  res
    .status(201)
    .json(
      CreateDepartmentResponse.parse(refreshed.buildDepartment(created.id)),
    );
});

router.patch(
  "/directory/departments/:departmentId",
  async (req, res): Promise<void> => {
    const params = UpdateDepartmentParams.safeParse(req.params);
    const body = UpdateDepartmentBody.safeParse(req.body);
    const snapshot = await loadSnapshot();
    if (!requireCapability(req, res, snapshot, "directory.manage")) return;
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid department update" });
      return;
    }
    const [updated] = await db.transaction(async (tx) => {
      const rows = await tx
        .update(departmentsTable)
        .set(body.data)
        .where(eq(departmentsTable.id, params.data.departmentId))
        .returning();
      if (rows[0]) {
        await addActivity(
          req,
          null,
          "Department updated",
          rows[0].name,
          false,
          tx,
        );
      }
      return rows;
    });
    if (!updated) {
      res.status(404).json({ error: "Department not found" });
      return;
    }
    const refreshed = await loadSnapshot();
    res.json(
      UpdateDepartmentResponse.parse(refreshed.buildDepartment(updated.id)),
    );
  },
);

router.get("/directory/roles", async (_req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  res.json(
    ListRolesResponse.parse(
      snapshot.roles.map((role) => snapshot.buildRole(role.id)),
    ),
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
  const departmentIds = [
    ...new Set([body.data.departmentId, ...(body.data.departmentIds ?? [])]),
  ];
  if (
    !departmentIds.every((departmentId) =>
      snapshot.departmentById.has(departmentId),
    )
  ) {
    res.status(400).json({ error: "One or more departments do not exist" });
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
    await tx
      .insert(roleDepartmentsTable)
      .values(
        departmentIds.map((departmentId) => ({ roleId: id, departmentId })),
      );
    const memberIds = [
      ...new Set(
        [
          ...(body.data.memberIds ?? []),
          body.data.leadId,
          body.data.deputyId,
        ].filter(Boolean),
      ),
    ] as string[];
    if (memberIds.length) {
      await tx
        .insert(roleMembersTable)
        .values(memberIds.map((memberId) => ({ roleId: id, memberId })));
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
  const currentDepartmentIds = snapshot.roleDepartments
    .filter((entry) => entry.roleId === currentRole.id)
    .map((entry) => entry.departmentId);
  const departmentIds = [
    ...new Set([
      body.data.departmentId ?? currentRole.departmentId,
      ...(body.data.departmentIds ?? currentDepartmentIds),
    ]),
  ];
  if (
    !departmentIds.every((departmentId) =>
      snapshot.departmentById.has(departmentId),
    )
  ) {
    res.status(400).json({ error: "One or more departments do not exist" });
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
      await tx
        .delete(roleDepartmentsTable)
        .where(eq(roleDepartmentsTable.roleId, params.data.roleId));
      await tx
        .insert(roleDepartmentsTable)
        .values(
          departmentIds.map((departmentId) => ({
            roleId: params.data.roleId,
            departmentId,
          })),
        );
    }
    if (body.data.memberIds) {
      await tx
        .delete(roleMembersTable)
        .where(eq(roleMembersTable.roleId, params.data.roleId));
      const current = snapshot.roleById.get(params.data.roleId);
      const memberIds = [
        ...new Set(
          [
            ...body.data.memberIds,
            body.data.leadId ?? current?.leadId,
            body.data.deputyId === undefined
              ? current?.deputyId
              : body.data.deputyId,
          ].filter(Boolean),
        ),
      ] as string[];
      if (memberIds.length) {
        await tx
          .insert(roleMembersTable)
          .values(
            memberIds.map((memberId) => ({
              roleId: params.data.roleId,
              memberId,
            })),
          );
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
  if (departmentId)
    topics = topics.filter((topic) => topic.departmentId === departmentId);
  if (roleId) topics = topics.filter((topic) => topic.roleId === roleId);
  if (search) {
    const needle = search.toLowerCase();
    topics = topics.filter(
      (topic) =>
        topic.title.toLowerCase().includes(needle) ||
        topic.description.toLowerCase().includes(needle),
    );
  }
  res.json(
    ListTopicsResponse.parse(topics.slice(0, limit).map(snapshot.buildTopic)),
  );
});

router.post("/topics", async (req, res): Promise<void> => {
  const parsed = CreateTopicBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const snapshot = await loadSnapshot();
  const role = snapshot.roleById.get(parsed.data.roleId);
  const roleDepartmentIds = snapshot.roleDepartments
    .filter((entry) => entry.roleId === parsed.data.roleId)
    .map((entry) => entry.departmentId);
  if (
    !role ||
    ![role.departmentId, ...roleDepartmentIds].includes(
      parsed.data.departmentId,
    )
  ) {
    res
      .status(400)
      .json({ error: "Role does not belong to the selected department" });
    return;
  }
  const estimatedStartDate = dateOnly(parsed.data.estimatedStartDate);
  const estimatedFinishDate = dateOnly(parsed.data.estimatedFinishDate);
  if (
    estimatedStartDate &&
    estimatedFinishDate &&
    estimatedStartDate > estimatedFinishDate
  ) {
    res
      .status(400)
      .json({
        error:
          "Estimated start date must be on or before estimated finish date",
      });
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
        estimatedStartDate,
        estimatedFinishDate,
        estimatedEffortHours: parsed.data.estimatedEffortHours,
        status: "pending_validation",
      })
      .returning();
    await addActivity(
      req,
      id,
      "Topic created",
      "Submitted for Service Head validation.",
      false,
      tx,
    );
    return rows;
  });
  const refreshed = await loadSnapshot();
  res
    .status(201)
    .json(CreateTopicResponse.parse(refreshed.buildTopic(created)));
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

router.delete("/topics/:topicId", async (req, res): Promise<void> => {
  const params = DeleteTopicParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid topic" });
    return;
  }
  const snapshot = await loadSnapshot();
  const topic = snapshot.topics.find((item) => item.id === params.data.topicId);
  if (!topic) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  if (!requireCapability(req, res, snapshot, "topic.delete")) return;
  const userId = currentUserId(req);
  const department = snapshot.departmentById.get(topic.departmentId);
  const isLocalAdmin = userId === "local-admin" && req.session.authProvider === "local";
  if (!isLocalAdmin && ![department?.serviceHeadId, department?.serviceHeadDeputyId].includes(userId)) {
    res.status(403).json({ error: "Only this department's Service Head or Deputy can delete this topic" });
    return;
  }
  const deleted = await db.transaction(async (tx) => {
    await tx.delete(collaboratorMilestonesTable).where(
      inArray(
        collaboratorMilestonesTable.milestoneId,
        tx.select({ id: milestonesTable.id }).from(milestonesTable).where(eq(milestonesTable.topicId, topic.id)),
      ),
    );
    await tx.delete(milestonesTable).where(eq(milestonesTable.topicId, topic.id));
    await tx.delete(topicCollaboratorsTable).where(eq(topicCollaboratorsTable.topicId, topic.id));
    await tx.delete(topicAllocationsTable).where(eq(topicAllocationsTable.topicId, topic.id));
    await tx.delete(topicFinishDateRevisionsTable).where(eq(topicFinishDateRevisionsTable.topicId, topic.id));
    await tx.delete(activityTable).where(eq(activityTable.topicId, topic.id));
    await tx.delete(notificationOutboxTable).where(eq(notificationOutboxTable.topicId, topic.id));
    const rows = await tx.delete(topicsTable).where(eq(topicsTable.id, topic.id)).returning({ id: topicsTable.id });
    if (!rows.length) return false;
    await tx.insert(activityTable).values({
      id: randomUUID(),
      topicId: null,
      actorId: userId,
      action: "Topic deleted",
      detail: `${topic.title} (${topic.id})`,
    });
    await tx.insert(auditLogTable).values({
      id: randomUUID(),
      actorId: userId,
      action: "Topic deleted",
      resourceType: "topic",
      resourceId: topic.id,
      requestId: String(req.id),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: { title: topic.title, departmentId: topic.departmentId, status: topic.status },
    });
    return true;
  });
  if (!deleted) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  res.status(204).end();
});

router.patch("/topics/:topicId", async (req, res): Promise<void> => {
  const params = UpdateTopicParams.safeParse(req.params);
  const body = UpdateTopicBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid topic update" });
    return;
  }
  const current = await loadSnapshot();
  const currentTopic = current.topics.find(
    (topic) => topic.id === params.data.topicId,
  );
  if (!currentTopic) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  if (!requireTopicManager(req, res, currentTopic, current)) return;
  const nextStart =
    body.data.estimatedStartDate === undefined
      ? currentTopic.estimatedStartDate
      : dateOnly(body.data.estimatedStartDate);
  const nextFinish =
    body.data.estimatedFinishDate === undefined
      ? currentTopic.estimatedFinishDate
      : dateOnly(body.data.estimatedFinishDate);
  if (nextStart && nextFinish && nextStart > nextFinish) {
    res
      .status(400)
      .json({
        error:
          "Estimated start date must be on or before estimated finish date",
      });
    return;
  }
  if (
    current.allocations.some(
      (allocation) => allocation.topicId === currentTopic.id,
    ) &&
    (!nextStart || !nextFinish)
  ) {
    res
      .status(400)
      .json({
        error:
          "Topics with allocations must retain both estimated start and finish dates",
      });
    return;
  }
  if (
    currentTopic.status === "pending_validation" &&
    body.data.status !== undefined &&
    body.data.status !== "pending_validation"
  ) {
    res
      .status(409)
      .json({
        error: "Pending topics must use an authorized validation endpoint",
      });
    return;
  }
  if (
    currentTopic.status !== "pending_validation" &&
    body.data.status === "pending_validation"
  ) {
    res
      .status(409)
      .json({
        error: "Validated topics cannot be reset to pending validation",
      });
    return;
  }
  const completedAt = body.data.status === "completed" ? new Date() : undefined;
  const [updated] = await db.transaction(async (tx) => {
    const rows = await tx
      .update(topicsTable)
      .set({
        ...body.data,
        estimatedStartDate:
          body.data.estimatedStartDate === undefined
            ? undefined
            : dateOnly(body.data.estimatedStartDate),
        estimatedFinishDate:
          body.data.estimatedFinishDate === undefined
            ? undefined
            : dateOnly(body.data.estimatedFinishDate),
        estimatedEffortHours: body.data.estimatedEffortHours,
        completedAt,
        updatedAt: new Date(),
      })
      .where(eq(topicsTable.id, params.data.topicId))
      .returning();
    if (rows[0]) {
      await addActivity(
        req,
        rows[0].id,
        "Topic updated",
        "Topic details or status were updated.",
        false,
        tx,
      );
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

router.patch(
  "/topics/:topicId/finish-date",
  async (req, res): Promise<void> => {
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
      await addActivity(
        req,
        topic.id,
        "Committed finish date changed",
        body.data.note,
        false,
        tx,
      );
      return rows;
    });
    if (!updated) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }
    const snapshot = await loadSnapshot();
    res.json(UpdateTopicFinishDateResponse.parse(snapshot.buildTopic(updated)));
  },
);

router.get("/topics/:topicId/allocations", async (req, res): Promise<void> => {
  const params = GetTopicAllocationsParams.safeParse(req.params);
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
  const rows = snapshot.allocations.filter(
    (allocation) => allocation.topicId === topic.id,
  );
  res.json(
    GetTopicAllocationsResponse.parse(
      rows.map((allocation) => ({
        topicId: allocation.topicId,
        member: snapshot.memberById.get(allocation.memberId),
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
  if (body.data.allocations.length && (!topic.estimatedStartDate || !topic.estimatedFinishDate)) {
    res
      .status(400)
      .json({
        error:
          "Topic allocation requires both estimated start and finish dates",
      });
    return;
  }
  const members = new Map(before.members.map((member) => [member.id, member]));
  const collaboratorIds = new Set(
    before.collaborators
      .filter((item) => item.topicId === topic.id)
      .map((item) => item.memberId),
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
    if (
      allocation.memberId !== topic.primaryAssigneeId &&
      !collaboratorIds.has(allocation.memberId)
    ) {
      res
        .status(400)
        .json({
          error:
            "Allocation member must be the primary assignee or a collaborator",
        });
      return;
    }
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(topicAllocationsTable)
      .where(eq(topicAllocationsTable.topicId, topic.id));
    if (body.data.allocations.length) {
      await tx.insert(topicAllocationsTable).values(
        body.data.allocations.map((allocation) => ({
          topicId: topic.id,
          memberId: allocation.memberId,
          allocationPercent: allocation.allocationPercent,
        })),
      );
    }
    await addActivity(
      req,
      topic.id,
      "Topic allocations replaced",
      `${body.data.allocations.length} member allocations for the topic date range`,
      false,
      tx,
    );
  });
  const snapshot = await loadSnapshot();
  res.json(
    ReplaceTopicAllocationsResponse.parse(
      snapshot.allocations
        .filter((allocation) => allocation.topicId === topic.id)
        .map((allocation) => ({
          topicId: allocation.topicId,
          member: snapshot.memberById.get(allocation.memberId),
          allocationPercent: allocation.allocationPercent,
        })),
    ),
  );
});

router.get("/occupancy/overview", async (req, res): Promise<void> => {
  const parsed = GetOccupancyOverviewQueryParams.safeParse({
    ...req.query,
    startDate: new Date(String(req.query.startDate ?? "")),
    endDate: new Date(String(req.query.endDate ?? "")),
  });
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "A valid startDate and endDate are required" });
    return;
  }
  const startDate = dateOnly(parsed.data.startDate);
  const endDate = dateOnly(parsed.data.endDate);
  if (!startDate || !endDate || startDate > endDate) {
    res.status(400).json({ error: "A valid ordered date range is required" });
    return;
  }
  const snapshot = await loadSnapshot();
  const rangeStart = new Date(`${startDate}T00:00:00Z`);
  const rangeEnd = new Date(`${endDate}T00:00:00Z`);
  const rangeDays =
    Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1;
  const overlapDays = (start: string, end: string) => {
    const from = new Date(`${start > startDate ? start : startDate}T00:00:00Z`);
    const to = new Date(`${end < endDate ? end : endDate}T00:00:00Z`);
    return Math.max(
      0,
      Math.floor((to.getTime() - from.getTime()) / 86400000) + 1,
    );
  };
  const overview = snapshot.members
    .filter((member) => member.status === "active")
    .map((member) => {
      const topicRows = snapshot.allocations.filter((allocation) => {
        if (allocation.memberId !== member.id) return false;
        const topic = snapshot.topics.find(
          (item) => item.id === allocation.topicId,
        );
        if (!topic) return false;
        const start = topic.estimatedStartDate;
        const end = topic.estimatedFinishDate ?? topic.targetDate;
        return Boolean(start && end && start <= endDate && end >= startDate);
      });
      const uniqueTopicRows = topicRows.reduce<typeof topicRows>(
        (latest, allocation) => {
          const index = latest.findIndex(
            (item) => item.topicId === allocation.topicId,
          );
          if (index === -1) latest.push(allocation);
          else if (allocation.updatedAt > latest[index].updatedAt)
            latest[index] = allocation;
          return latest;
        },
        [],
      );
      const milestoneRows = snapshot.milestones.filter(
        (milestone) =>
          milestone.assigneeId === member.id &&
          milestone.workloadPercent > 0 &&
          Boolean(milestone.beginDate && milestone.targetDate) &&
          milestone.beginDate! <= endDate &&
          milestone.targetDate! >= startDate,
      );
      const topicPercent = uniqueTopicRows.reduce((sum, row) => {
        const topic = snapshot.topics.find((item) => item.id === row.topicId)!;
        return (
          sum +
          (row.allocationPercent *
            overlapDays(
              topic.estimatedStartDate!,
              topic.estimatedFinishDate ?? topic.targetDate!,
            )) /
            rangeDays
        );
      }, 0);
      const milestonePercent = milestoneRows.reduce(
        (sum, row) =>
          sum +
          (row.workloadPercent * overlapDays(row.beginDate!, row.targetDate!)) /
            rangeDays,
        0,
      );
      const topicAllocationPercent = Math.round(topicPercent);
      const milestoneAllocationPercent = Math.round(milestonePercent);
      const totalOccupancyPercent = Math.round(
        member.dailyBusinessPercent + topicPercent + milestonePercent,
      );
      return {
        member,
        startDate,
        endDate,
        dailyBusinessPercent: member.dailyBusinessPercent,
        topics: uniqueTopicRows.map((row) => ({
          topicId: row.topicId,
          title:
            snapshot.topics.find((topic) => topic.id === row.topicId)?.title ??
            "Unknown topic",
          allocationPercent: Math.round(
            (row.allocationPercent *
              overlapDays(
                snapshot.topics.find((topic) => topic.id === row.topicId)!
                  .estimatedStartDate!,
                snapshot.topics.find((topic) => topic.id === row.topicId)!
                  .estimatedFinishDate ??
                  snapshot.topics.find((topic) => topic.id === row.topicId)!
                    .targetDate!,
              )) /
              rangeDays,
          ),
          allocationType: "topic" as const,
          milestoneId: null,
        })),
        milestones: milestoneRows.map((row) => ({
          topicId: row.topicId,
          milestoneId: row.id,
          title: snapshot.topics.find((topic) => topic.id === row.topicId)
            ?.title
            ? `${snapshot.topics.find((topic) => topic.id === row.topicId)?.title}: ${row.title}`
            : row.title,
          allocationPercent: Math.round(
            (row.workloadPercent *
              overlapDays(row.beginDate!, row.targetDate!)) /
              rangeDays,
          ),
          allocationType: "milestone" as const,
        })),
        topicAllocationPercent,
        milestoneAllocationPercent,
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
    ![department.serviceHeadId, department.serviceHeadDeputyId].includes(
      currentUserId(req),
    )
  ) {
    res
      .status(403)
      .json({ error: "Use break-glass validation outside your scope" });
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
      .where(
        and(
          eq(topicsTable.id, topic.id),
          eq(topicsTable.status, "pending_validation"),
        ),
      )
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
    res
      .status(409)
      .json({ error: "Topic has already left pending validation" });
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
      res
        .status(400)
        .json({ error: "A detailed break-glass explanation is required" });
      return;
    }
    const snapshotBefore = await loadSnapshot();
    if (!requireCapability(req, res, snapshotBefore, "validation.break_glass"))
      return;
    const topic = snapshotBefore.topics.find(
      (item) => item.id === params.data.topicId,
    );
    if (!topic) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }
    const authorityDepartment = snapshotBefore.departmentById.get(
      topic.departmentId,
    );
    if (
      authorityDepartment &&
      [
        authorityDepartment.serviceHeadId,
        authorityDepartment.serviceHeadDeputyId,
      ].includes(currentUserId(req))
    ) {
      res
        .status(400)
        .json({ error: "Use standard validation inside your assigned scope" });
      return;
    }
    const recipients = authorityDepartment
      ? ([
          authorityDepartment.serviceHeadId,
          authorityDepartment.serviceHeadDeputyId,
        ]
          .filter(Boolean)
          .map((id) => snapshotBefore.memberById.get(id as string)?.email)
          .filter(Boolean) as string[])
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
      res
        .status(409)
        .json({ error: "Topic has already left pending validation" });
      return;
    }
    req.log.warn(
      { topicId: updated.id, departmentId: updated.departmentId },
      "Break-glass validation used; responsible authority notification queued",
    );
    const snapshot = await loadSnapshot();
    res.json(
      ValidateTopicBreakGlassResponse.parse(snapshot.buildTopic(updated)),
    );
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
  if (topic.status === "pending_validation" && !topic.primaryAssigneeId && body.data.memberId) {
    res
      .status(409)
      .json({ error: "A topic must be validated before assignment" });
    return;
  }
  if (body.data.memberId && !before.memberById.has(body.data.memberId)) {
    res.status(400).json({ error: "Assignee not found" });
    return;
  }
  const [updated] = await db.transaction(async (tx) => {
    const rows = await tx
      .update(topicsTable)
      .set({
        primaryAssigneeId: body.data.memberId,
        status: topic.status === "open" && body.data.memberId
          ? "in_progress"
          : topic.status === "in_progress" && !body.data.memberId
            ? "open"
            : topic.status,
        updatedAt: new Date(),
      })
      .where(eq(topicsTable.id, params.data.topicId))
      .returning();
    if (rows[0]) {
      if (
        topic.primaryAssigneeId &&
        topic.primaryAssigneeId !== body.data.memberId &&
        !before.collaborators.some(
          (entry) => entry.topicId === topic.id && entry.memberId === topic.primaryAssigneeId,
        )
      ) {
        await tx.delete(topicAllocationsTable).where(and(
          eq(topicAllocationsTable.topicId, topic.id),
          eq(topicAllocationsTable.memberId, topic.primaryAssigneeId),
        ));
      }
      await addActivity(
        req,
        rows[0].id,
        body.data.memberId ? "Primary assignee changed" : "Primary assignee removed",
        body.data.memberId
          ? `Accountable owner: ${before.memberById.get(body.data.memberId)?.name}.`
          : "Topic has no primary owner.",
        false,
        tx,
      );
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

router.post(
  "/topics/:topicId/collaborators",
  async (req, res): Promise<void> => {
    const params = AddTopicCollaboratorParams.safeParse(req.params);
    const body = AddTopicCollaboratorBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid collaborator" });
      return;
    }
    const before = await loadSnapshot();
    const existingTopic = before.topics.find(
      (item) => item.id === params.data.topicId,
    );
    if (!existingTopic) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }
    if (!requireTopicManager(req, res, existingTopic, before)) return;
    if (!before.memberById.has(body.data.memberId)) {
      res.status(400).json({ error: "Collaborator not found" });
      return;
    }
    if (
      before.collaborators.some(
        (collaborator) =>
          collaborator.topicId === existingTopic.id &&
          collaborator.memberId === body.data.memberId,
      )
    ) {
      res
        .status(409)
        .json({ error: "Member is already a collaborator on this topic" });
      return;
    }
    if (
      body.data.milestoneIds?.some(
        (id) =>
          !before.milestones.some(
            (milestone) =>
              milestone.id === id && milestone.topicId === existingTopic.id,
          ),
      )
    ) {
      res
        .status(400)
        .json({
          error: "A collaborator milestone does not belong to this topic",
        });
      return;
    }
    const id = randomUUID();
    const [created] = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(topicCollaboratorsTable)
        .values({
          id,
          topicId: params.data.topicId,
          memberId: body.data.memberId,
        })
        .returning();
      if (body.data.milestoneIds?.length) {
        await tx
          .insert(collaboratorMilestonesTable)
          .values(
            body.data.milestoneIds.map((milestoneId) => ({
              collaboratorId: id,
              milestoneId,
            })),
          );
      }
      await addActivity(
        req,
        params.data.topicId,
        "Collaborator added",
        "Topic-scoped access granted.",
        false,
        tx,
      );
      return rows;
    });
    const snapshot = await loadSnapshot();
    const collaborator = snapshot.collaborators.find(
      (item) => item.id === created.id,
    );
    const topic = snapshot.topics.find(
      (item) => item.id === params.data.topicId,
    );
    if (!collaborator || !topic)
      throw new Error("Created collaborator could not be loaded");
    const built = snapshot
      .buildTopic(topic)
      .collaborators?.find((item) => item.id === created.id);
    res.status(201).json(AddTopicCollaboratorResponse.parse(built));
  },
);

router.delete("/topics/:topicId/collaborators/:collaboratorId", async (req, res): Promise<void> => {
  const params = DeleteTopicCollaboratorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid collaborator" });
    return;
  }
  const snapshot = await loadSnapshot();
  const topic = snapshot.topics.find((item) => item.id === params.data.topicId);
  const collaborator = snapshot.collaborators.find(
    (item) => item.topicId === params.data.topicId && item.id === params.data.collaboratorId,
  );
  if (!topic || !collaborator) {
    res.status(404).json({ error: "Collaborator not found" });
    return;
  }
  if (!requireTopicManager(req, res, topic, snapshot)) return;
  await db.transaction(async (tx) => {
    await tx.delete(collaboratorMilestonesTable)
      .where(eq(collaboratorMilestonesTable.collaboratorId, collaborator.id));
    await tx.delete(topicCollaboratorsTable)
      .where(and(
        eq(topicCollaboratorsTable.topicId, topic.id),
        eq(topicCollaboratorsTable.id, collaborator.id),
      ));
    if (collaborator.memberId !== topic.primaryAssigneeId) {
      await tx.delete(topicAllocationsTable).where(and(
        eq(topicAllocationsTable.topicId, topic.id),
        eq(topicAllocationsTable.memberId, collaborator.memberId),
      ));
    }
    await addActivity(
      req,
      topic.id,
      "Collaborator removed",
      `${snapshot.memberById.get(collaborator.memberId)?.name ?? collaborator.memberId} removed from the topic.`,
      false,
      tx,
    );
  });
  res.status(204).end();
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
  const beginDate = dateOnly(body.data.beginDate);
  const targetDate = dateOnly(body.data.targetDate);
  if (!beginDate || !targetDate || beginDate > targetDate) {
    res
      .status(400)
      .json({
        error: "Milestones require a begin date on or before the target date",
      });
    return;
  }
  if ((body.data.workloadPercent ?? 0) > 0 && !body.data.assigneeId) {
    res.status(400).json({ error: "Milestone occupancy requires an assignee" });
    return;
  }
  const [created] = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(milestonesTable)
      .values({
        id: randomUUID(),
        topicId: params.data.topicId,
        title: body.data.title,
        description: body.data.description,
        beginDate,
        targetDate,
        assigneeId: body.data.assigneeId,
        workloadPercent: body.data.workloadPercent ?? 0,
      })
      .returning();
    await addActivity(
      req,
      params.data.topicId,
      "Milestone added",
      rows[0].title,
      false,
      tx,
    );
    return rows;
  });
  const snapshot = await loadSnapshot();
  res
    .status(201)
    .json(AddTopicMilestoneResponse.parse(snapshot.buildMilestone(created)));
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
  const nextBeginDate =
    body.data.beginDate === undefined
      ? existingMilestone.beginDate
      : dateOnly(body.data.beginDate);
  const nextTargetDate =
    body.data.targetDate === undefined
      ? existingMilestone.targetDate
      : dateOnly(body.data.targetDate);
  const nextAssigneeId =
    body.data.assigneeId === undefined
      ? existingMilestone.assigneeId
      : body.data.assigneeId;
  const nextWorkloadPercent =
    body.data.workloadPercent ?? existingMilestone.workloadPercent;
  if (
    Boolean(nextBeginDate) !== Boolean(nextTargetDate) ||
    (nextBeginDate && nextTargetDate && nextBeginDate > nextTargetDate)
  ) {
    res
      .status(400)
      .json({
        error: "Milestone must retain both ordered begin and target dates",
      });
    return;
  }
  if (nextWorkloadPercent > 0 && !nextAssigneeId) {
    res.status(400).json({ error: "Milestone occupancy requires an assignee" });
    return;
  }
  const completedAt = body.data.status === "completed" ? new Date() : undefined;
  const [updated] = await db.transaction(async (tx) => {
    const rows = await tx
      .update(milestonesTable)
      .set({
        ...body.data,
        beginDate:
          body.data.beginDate === undefined
            ? undefined
            : dateOnly(body.data.beginDate),
        targetDate:
          body.data.targetDate === undefined
            ? undefined
            : dateOnly(body.data.targetDate),
        completedAt,
      })
      .where(eq(milestonesTable.id, params.data.milestoneId))
      .returning();
    if (rows[0]) {
      await addActivity(
        req,
        rows[0].topicId,
        "Milestone updated",
        `${rows[0].title}: ${rows[0].status}`,
        false,
        tx,
      );
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
  const milestone = before.milestones.find(
    (item) => item.id === params.data.milestoneId,
  );
  const topic = milestone
    ? before.topics.find((item) => item.id === milestone.topicId)
    : undefined;
  if (!milestone || !topic) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }
  if (!requireTopicManager(req, res, topic, before)) return;
  await db.transaction(async (tx) => {
    await tx
      .delete(collaboratorMilestonesTable)
      .where(eq(collaboratorMilestonesTable.milestoneId, milestone.id));
    await tx
      .delete(milestonesTable)
      .where(eq(milestonesTable.id, milestone.id));
    await addActivity(
      req,
      topic.id,
      "Milestone deleted",
      milestone.title,
      false,
      tx,
    );
  });
  res.sendStatus(204);
});

router.get("/validation-queue", async (req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  const responsibleDepartmentIds = snapshot.departments
    .filter((department) =>
      [department.serviceHeadId, department.serviceHeadDeputyId].includes(
        currentUserId(req),
      ),
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
      [department.serviceHeadId, department.serviceHeadDeputyId].includes(
        currentUserId(req),
      ),
    )
    .map((department) => department.id);
  res.json(
    GetMyWorkResponse.parse({
      created: builtTopics.filter(
        (topic) => topic.creator.id === currentUserId(req),
      ),
      assigned: builtTopics.filter(
        (topic) => topic.primaryAssignee?.id === currentUserId(req),
      ),
      milestones: snapshot.milestones
        .filter((milestone) => milestone.assigneeId === currentUserId(req))
        .map(snapshot.buildMilestone),
      collaborations: builtTopics.filter((topic) =>
        collaboratedTopicIds.has(topic.id),
      ),
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
      snapshot.activities
        .slice(0, parsed.data.limit)
        .map(snapshot.buildActivity),
    ),
  );
});

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  const now = new Date();
  const grouped = (
    labels: string[],
    value: (topic: (typeof snapshot.topics)[number]) => string,
  ) =>
    labels.map((label) => ({
      label,
      count: snapshot.topics.filter((topic) => value(topic) === label).length,
      color: null,
    }));
  const departmentNames = snapshot.departments.map(
    (department) => department.name,
  );
  const roleNames = snapshot.roles.map((role) => role.name);
  res.json(
    GetDashboardSummaryResponse.parse({
      kpis: {
        total: snapshot.topics.length,
        pendingValidation: snapshot.topics.filter(
          (topic) => topic.status === "pending_validation",
        ).length,
        inProgress: snapshot.topics.filter(
          (topic) => topic.status === "in_progress",
        ).length,
        completed: snapshot.topics.filter((topic) =>
          ["completed", "closed"].includes(topic.status),
        ).length,
        overdue: snapshot.topics.filter(
          (topic) =>
            topic.targetDate &&
            new Date(topic.targetDate) < now &&
            !["completed", "closed", "rejected"].includes(topic.status),
        ).length,
        unassigned: snapshot.topics.filter((topic) => !topic.primaryAssigneeId)
          .length,
      },
      statusCounts: grouped(
        ["pending_validation", "open", "in_progress", "completed", "closed"],
        (topic) => topic.status,
      ),
      priorityCounts: grouped(
        ["P1", "P2", "P3", "P4"],
        (topic) => topic.priority,
      ),
      departmentCounts: departmentNames.map((label) => ({
        label,
        count: snapshot.topics.filter(
          (topic) =>
            snapshot.departmentById.get(topic.departmentId)?.name === label,
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
