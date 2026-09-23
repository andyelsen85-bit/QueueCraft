import { createHash } from "node:crypto";
import { getTableConfig } from "drizzle-orm/pg-core";
import { getTableColumns, inArray, not } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  activityTable, applicationSettingsTable, auditLogTable, collaboratorMilestonesTable, db,
  departmentsTable, membersTable, milestonesTable, notificationOutboxTable,
  notificationRulesTable, roleDepartmentsTable, roleMembersTable, rolesTable,
  topicCollaboratorsTable, topicFinishDateRevisionsTable, topicWeeklyAllocationsTable, topicsTable,
} from "@workspace/db";

export const BACKUP_FORMAT = "queuecraft-json";
export const BACKUP_VERSION = 2;
export const BACKUP_TABLES = [
  ["members", membersTable], ["departments", departmentsTable], ["application_settings", applicationSettingsTable],
  ["roles", rolesTable], ["role_departments", roleDepartmentsTable], ["role_members", roleMembersTable],
  ["topics", topicsTable], ["topic_collaborators", topicCollaboratorsTable], ["milestones", milestonesTable],
  ["collaborator_milestones", collaboratorMilestonesTable], ["topic_weekly_allocations", topicWeeklyAllocationsTable],
  ["topic_finish_date_revisions", topicFinishDateRevisionsTable], ["activity", activityTable],
  ["audit_log", auditLogTable], ["notification_outbox", notificationOutboxTable], ["notification_rules", notificationRulesTable],
] as const;
export type BackupTableName = (typeof BACKUP_TABLES)[number][0];

function tableManifest() {
  return BACKUP_TABLES.map(([name, table]) => {
    const columns = Object.entries(getTableColumns(table)).map(([key, column]) => ({
      name: column.name, key, dataType: column.dataType, columnType: column.columnType,
      notNull: column.notNull, hasDefault: column.hasDefault,
    })).sort((a, b) => a.name.localeCompare(b.name));
    return { name, columns };
  });
}
export const BACKUP_MANIFEST = tableManifest();
export const BACKUP_FINGERPRINT = createHash("sha256").update(JSON.stringify(BACKUP_MANIFEST)).digest("hex");

export type QueueCraftBackup = {
  format: typeof BACKUP_FORMAT; version: typeof BACKUP_VERSION;
  manifest: typeof BACKUP_MANIFEST; fingerprint: string;
  tables: Record<BackupTableName, unknown[]>;
};

const tableNames = new Set(BACKUP_TABLES.map(([name]) => name));
export function validateBackup(value: unknown): QueueCraftBackup {
  if (!value || typeof value !== "object") throw new Error("Backup must be a JSON object");
  const c = value as Record<string, unknown>;
  if (c.format !== BACKUP_FORMAT || c.version !== BACKUP_VERSION) throw new Error(`Unsupported backup format; expected ${BACKUP_FORMAT} v${BACKUP_VERSION}`);
  if (c.fingerprint !== BACKUP_FINGERPRINT || JSON.stringify(c.manifest) !== JSON.stringify(BACKUP_MANIFEST)) throw new Error("Backup schema manifest does not match this application");
  if (!c.tables || typeof c.tables !== "object" || Array.isArray(c.tables)) throw new Error("Backup tables must be an object");
  const tables = c.tables as Record<string, unknown>;
  const keys = Object.keys(tables);
  if (keys.length !== BACKUP_TABLES.length || keys.some((key) => !tableNames.has(key as BackupTableName))) throw new Error("Backup table coverage does not match the current schema");
  for (const [name] of BACKUP_TABLES) {
    if (!Array.isArray(tables[name]) || (tables[name] as unknown[]).some((row) => !row || typeof row !== "object" || Array.isArray(row))) throw new Error(`Backup table ${name} contains an invalid row`);
  }
  return value as QueueCraftBackup;
}

function reviveRows(name: BackupTableName, rows: unknown[]) {
  const manifest = BACKUP_MANIFEST.find((entry) => entry.name === name)!;
  const timestampKeys = new Set(manifest.columns.filter((column) => column.columnType.includes("Timestamp")).map((column) => column.key));
  return (rows as Record<string, unknown>[]).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key, timestampKeys.has(key) && typeof value === "string" ? new Date(value) : value])));
}

export async function exportBackup(): Promise<QueueCraftBackup> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`);
    const tables = {} as QueueCraftBackup["tables"];
    for (const [name, table] of BACKUP_TABLES) tables[name] = await tx.select().from(table);
    return { format: BACKUP_FORMAT, version: BACKUP_VERSION, manifest: BACKUP_MANIFEST, fingerprint: BACKUP_FINGERPRINT, tables };
  });
}

const deleteOrder = [
  notificationOutboxTable, notificationRulesTable, collaboratorMilestonesTable, topicWeeklyAllocationsTable,
  topicFinishDateRevisionsTable, activityTable, topicCollaboratorsTable, milestonesTable,
  roleMembersTable, roleDepartmentsTable,
] as const;

export async function restoreBackup(
  input: unknown,
  auditEvent?: typeof auditLogTable.$inferInsert,
): Promise<void> {
  const backup = validateBackup(input);
  await db.transaction(async (tx) => {
    const existingAudit = await tx.select().from(auditLogTable);
    const protectedMembers = new Set(existingAudit.map((row) => row.actorId));
    if (auditEvent?.actorId) protectedMembers.add(auditEvent.actorId);

    // Release unique directory identifiers before replaying the backup. This
    // also gives audit-only retained members collision-proof archival identities.
    await tx.execute(sql`
      UPDATE members
      SET email = 'restored-archive-' || id || '@invalid.local',
          external_subject = NULL
    `);

    // Members are upserted first because immutable audit rows reference them.
    const incomingMembers = reviveRows("members", backup.tables.members);
    for (const incoming of incomingMembers) {
      const { id: _id, ...set } = incoming as Record<string, unknown>;
      await tx
        .insert(membersTable)
        .values(incoming as never)
        .onConflictDoUpdate({ target: membersTable.id, set: set as never });
    }
    for (const table of deleteOrder) await tx.delete(table);
    await tx.delete(topicsTable);
    await tx.delete(rolesTable);
    await tx.delete(applicationSettingsTable);
    await tx.delete(departmentsTable);
    const auditMemberIds = new Set([...protectedMembers, ...incomingMembers.map((row) => String((row as Record<string, unknown>).id))]);
    const allMembers = await tx.select({ id: membersTable.id }).from(membersTable);
    const removable = allMembers.map((row) => row.id).filter((id) => !auditMemberIds.has(id));
    if (removable.length) await tx.delete(membersTable).where(inArray(membersTable.id, removable));
    const retainedOnlyForAudit = [...protectedMembers].filter(
      (id) => !incomingMembers.some((row) => String((row as Record<string, unknown>).id) === id),
    );
    if (retainedOnlyForAudit.length) {
      await tx
        .update(membersTable)
        .set({ status: "disabled", externalSubject: null })
        .where(inArray(membersTable.id, retainedOnlyForAudit));
    }

    // A restore changes both membership and authority. Invalidate every
    // server-side session so no pre-restore authorization survives.
    await tx.execute(sql`DELETE FROM user_sessions`);

    const insertOrder = BACKUP_TABLES.filter(([name]) => name !== "members" && name !== "audit_log");
    for (const [name, table] of insertOrder) {
      const rows = reviveRows(name, backup.tables[name]);
      if (rows.length) await tx.insert(table).values(rows as never).onConflictDoNothing();
    }
    const existingAuditIds = new Set(existingAudit.map((row) => row.id));
    const incomingAudit = reviveRows("audit_log", backup.tables.audit_log).filter((row) => !existingAuditIds.has(String((row as Record<string, unknown>).id)));
    if (incomingAudit.length) await tx.insert(auditLogTable).values(incomingAudit as never).onConflictDoNothing();
    if (auditEvent) await tx.insert(auditLogTable).values(auditEvent);
    await tx.execute(sql`DO $$ DECLARE r record; BEGIN FOR r IN SELECT c.oid::regclass s, n.nspname ns, t.relname tn, a.attname cn FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_depend d ON d.objid=c.oid AND d.deptype='a' JOIN pg_class t ON t.oid=d.refobjid JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid WHERE c.relkind='S' AND n.nspname=current_schema() LOOP EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I.%I), 1), true)', r.s, r.cn, r.ns, r.tn); END LOOP; END $$;`);
  });
}