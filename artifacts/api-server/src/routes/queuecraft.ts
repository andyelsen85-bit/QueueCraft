import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  activityTable,
  collaboratorMilestonesTable,
  departmentsTable,
  membersTable,
  milestonesTable,
  roleMembersTable,
  rolesTable,
  topicCollaboratorsTable,
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
  ValidateTopicBody,
  ValidateTopicBreakGlassBody,
  ValidateTopicBreakGlassParams,
  ValidateTopicBreakGlassResponse,
  ValidateTopicParams,
  ValidateTopicResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const currentUserId = "member-andy";

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
    roleMembers,
    topics,
    collaborators,
    collaboratorMilestones,
    milestones,
    activities,
  ] = await Promise.all([
    db.select().from(membersTable),
    db.select().from(departmentsTable),
    db.select().from(rolesTable),
    db.select().from(roleMembersTable),
    db.select().from(topicsTable).orderBy(desc(topicsTable.updatedAt)),
    db.select().from(topicCollaboratorsTable),
    db.select().from(collaboratorMilestonesTable),
    db.select().from(milestonesTable),
    db.select().from(activityTable).orderBy(desc(activityTable.createdAt)),
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
      lead,
      deputy: member(role.deputyId),
      memberCount: roleMembers.filter((entry) => entry.roleId === id).length,
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
    completionSummary: topic.completionSummary,
  });

  return {
    members,
    departments,
    roles,
    topics,
    milestones,
    activities,
    collaborators,
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
  topicId: string | null,
  action: string,
  detail: string,
  isBreakGlass = false,
) {
  await db.insert(activityTable).values({
    id: randomUUID(),
    topicId,
    actorId: currentUserId,
    action,
    detail,
    isBreakGlass,
  });
}

router.get("/session", async (_req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  const user = snapshot.memberById.get(currentUserId);
  if (!user) {
    res.status(401).json({ error: "No active user" });
    return;
  }
  res.json(
    GetSessionResponse.parse({
      user,
      capabilities: [
        "topic.create",
        "topic.assign",
        "topic.edit",
        "validation.approve",
        "validation.break_glass",
      ],
    }),
  );
});

router.get("/directory/members", async (_req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  res.json(ListMembersResponse.parse(snapshot.members));
});

router.get("/directory/departments", async (_req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  res.json(
    ListDepartmentsResponse.parse(
      snapshot.departments.map((department) => snapshot.buildDepartment(department.id)),
    ),
  );
});

router.get("/directory/roles", async (_req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  res.json(
    ListRolesResponse.parse(snapshot.roles.map((role) => snapshot.buildRole(role.id))),
  );
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
  if (!role || role.departmentId !== parsed.data.departmentId) {
    res.status(400).json({ error: "Role does not belong to the selected department" });
    return;
  }
  const id = randomUUID();
  const [created] = await db
    .insert(topicsTable)
    .values({
      id,
      title: parsed.data.title,
      description: parsed.data.description,
      departmentId: parsed.data.departmentId,
      roleId: parsed.data.roleId,
      priority: parsed.data.priority,
      creatorId: currentUserId,
      primaryAssigneeId: parsed.data.primaryAssigneeId,
      targetDate: dateOnly(parsed.data.targetDate),
      status: "pending_validation",
    })
    .returning();
  await addActivity(id, "Topic created", "Submitted for Service Head validation.");
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
  const completedAt = body.data.status === "completed" ? new Date() : undefined;
  const [updated] = await db
    .update(topicsTable)
    .set({
      ...body.data,
      targetDate:
        body.data.targetDate === undefined ? undefined : dateOnly(body.data.targetDate),
      completedAt,
      updatedAt: new Date(),
    })
    .where(eq(topicsTable.id, params.data.topicId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  await addActivity(updated.id, "Topic updated", "Topic details or status were updated.");
  const snapshot = await loadSnapshot();
  res.json(UpdateTopicResponse.parse(snapshot.buildTopic(updated)));
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
    ![department.serviceHeadId, department.serviceHeadDeputyId].includes(currentUserId)
  ) {
    res.status(403).json({ error: "Use break-glass validation outside your scope" });
    return;
  }
  const [updated] = await db
    .update(topicsTable)
    .set({
      status: "open",
      validationMode: "standard",
      validationReason: body.data.note,
      validatorId: currentUserId,
      validatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(topicsTable.id, topic.id))
    .returning();
  await addActivity(topic.id, "Topic validated", body.data.note ?? "Validated by service authority.");
  const refreshed = await loadSnapshot();
  res.json(ValidateTopicResponse.parse(refreshed.buildTopic(updated)));
});

router.post("/topics/:topicId/validation-break-glass", async (req, res): Promise<void> => {
  const params = ValidateTopicBreakGlassParams.safeParse(req.params);
  const body = ValidateTopicBreakGlassBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "A detailed break-glass explanation is required" });
    return;
  }
  const [updated] = await db
    .update(topicsTable)
    .set({
      status: "open",
      validationMode: "break_glass",
      validationReason: body.data.reason,
      validatorId: currentUserId,
      validatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(topicsTable.id, params.data.topicId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  await addActivity(
    updated.id,
    "Break-glass validation",
    `${body.data.reason} Responsible authority notification queued.`,
    true,
  );
  req.log.warn(
    { topicId: updated.id, departmentId: updated.departmentId },
    "Break-glass validation used; responsible authority notification queued",
  );
  const snapshot = await loadSnapshot();
  res.json(ValidateTopicBreakGlassResponse.parse(snapshot.buildTopic(updated)));
});

router.post("/topics/:topicId/assign", async (req, res): Promise<void> => {
  const params = AssignTopicParams.safeParse(req.params);
  const body = AssignTopicBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid assignment" });
    return;
  }
  const [updated] = await db
    .update(topicsTable)
    .set({ primaryAssigneeId: body.data.memberId, status: "in_progress", updatedAt: new Date() })
    .where(eq(topicsTable.id, params.data.topicId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  await addActivity(updated.id, "Primary assignee changed", "Accountable owner updated.");
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
  const id = randomUUID();
  const [created] = await db
    .insert(topicCollaboratorsTable)
    .values({ id, topicId: params.data.topicId, memberId: body.data.memberId })
    .returning();
  if (body.data.milestoneIds?.length) {
    await db.insert(collaboratorMilestonesTable).values(
      body.data.milestoneIds.map((milestoneId) => ({ collaboratorId: id, milestoneId })),
    );
  }
  await addActivity(params.data.topicId, "Collaborator added", "Topic-scoped access granted.");
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
  const [created] = await db
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
  await addActivity(params.data.topicId, "Milestone added", created.title);
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
  const completedAt = body.data.status === "completed" ? new Date() : undefined;
  const [updated] = await db
    .update(milestonesTable)
    .set({
      ...body.data,
      targetDate:
        body.data.targetDate === undefined ? undefined : dateOnly(body.data.targetDate),
      completedAt,
    })
    .where(eq(milestonesTable.id, params.data.milestoneId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }
  await addActivity(updated.topicId, "Milestone updated", `${updated.title}: ${updated.status}`);
  const snapshot = await loadSnapshot();
  res.json(UpdateMilestoneResponse.parse(snapshot.buildMilestone(updated)));
});

router.get("/validation-queue", async (_req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  const responsibleDepartmentIds = snapshot.departments
    .filter((department) =>
      [department.serviceHeadId, department.serviceHeadDeputyId].includes(currentUserId),
    )
    .map((department) => department.id);
  const queue = snapshot.topics.filter(
    (topic) =>
      topic.status === "pending_validation" &&
      responsibleDepartmentIds.includes(topic.departmentId),
  );
  res.json(GetValidationQueueResponse.parse(queue.map(snapshot.buildTopic)));
});

router.get("/my-work", async (_req, res): Promise<void> => {
  const snapshot = await loadSnapshot();
  const builtTopics = snapshot.topics.map(snapshot.buildTopic);
  const collaboratedTopicIds = new Set(
    snapshot.collaborators
      .filter((entry) => entry.memberId === currentUserId)
      .map((entry) => entry.topicId),
  );
  const responsibleDepartmentIds = snapshot.departments
    .filter((department) =>
      [department.serviceHeadId, department.serviceHeadDeputyId].includes(currentUserId),
    )
    .map((department) => department.id);
  res.json(
    GetMyWorkResponse.parse({
      created: builtTopics.filter((topic) => topic.creator.id === currentUserId),
      assigned: builtTopics.filter((topic) => topic.primaryAssignee?.id === currentUserId),
      milestones: snapshot.milestones
        .filter((milestone) => milestone.assigneeId === currentUserId)
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