import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { db } from "@workspace/db";
import { applicationSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { config } from "../config";

export type RuntimeSettings = {
  publicBaseUrl?: string; adfsEnabled?: boolean; adfsDisplayName?: string; adfsIssuer?: string; adfsDiscoveryUrl?: string; adfsClientId?: string; adfsClientSecret?: string; adfsRedirectUri?: string; adfsScopes?: string; adfsUsernameClaim?: string; adfsEmailClaim?: string; adfsDisplayNameClaim?: string; adfsCaCertificate?: string;
  ldapsUrl?: string; ldapsBindDn?: string; ldapsBindPassword?: string; ldapsBaseDn?: string; ldapsUserFilter?: string; ldapsCaCertificate?: string; ldapsCioGroupDn?: string;
  smtpHost?: string; smtpPort?: number; smtpSecure?: boolean; smtpUser?: string; smtpPassword?: string; smtpFrom?: string; smtpFromName?: string;
  adminPasswordHash?: string;
  adminMemberId?: string;
};

const key = Buffer.from(hkdfSync("sha256", config.appEncryptionKey, Buffer.alloc(0), "queuecraft-runtime-settings", 32));
const legacyKey = createHash("sha256").update(config.sessionSecret).digest();
type SettingsExecutor = Pick<typeof db, "select" | "update" | "insert">;
export function encryptRuntimeSettings(value: RuntimeSettings) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `v2.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}
function decryptWith(value: string, decryptKey: Buffer, versioned: boolean) {
  const parts = value.split(".");
  const [ivPart, tagPart, dataPart] = versioned ? parts.slice(1) : parts;
  const iv = Buffer.from(ivPart ?? "", versioned ? "base64url" : "base64");
  const tag = Buffer.from(tagPart ?? "", versioned ? "base64url" : "base64");
  const data = Buffer.from(dataPart ?? "", versioned ? "base64url" : "base64");
  if (iv.length !== 12 || tag.length !== 16 || !data.length) throw new Error("Invalid encrypted settings payload");
  const decipher = createDecipheriv("aes-256-gcm", decryptKey, iv); decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")) as RuntimeSettings;
}
export function decryptRuntimeSettings(value: string): { settings: RuntimeSettings; migrated: boolean } {
  if (value.startsWith("v2.")) return { settings: decryptWith(value, key, true), migrated: false };
  try {
    return { settings: decryptWith(value, key, false), migrated: false };
  } catch {
    return { settings: decryptWith(value, legacyKey, false), migrated: true };
  }
}
async function migrate(executor: SettingsExecutor, row: { encryptedValue: string; updatedById: string | null }, settings: RuntimeSettings) {
  await executor.update(applicationSettingsTable).set({
    encryptedValue: encryptRuntimeSettings(settings),
    updatedAt: new Date(),
    updatedById: row.updatedById,
  }).where(eq(applicationSettingsTable.id, "runtime"));
}
export async function getRuntimeSettings(executor: SettingsExecutor = db): Promise<RuntimeSettings> {
  const [row] = await executor.select().from(applicationSettingsTable).where(eq(applicationSettingsTable.id, "runtime")).limit(1);
  if (!row) return {};
  const result = decryptRuntimeSettings(row.encryptedValue);
  if (result.migrated) await migrate(executor, row, result.settings);
  return result.settings;
}
export async function updateRuntimeSettings(update: Partial<RuntimeSettings>, memberId?: string, executor: SettingsExecutor = db) {
  const current = await getRuntimeSettings(executor);
  const value = { ...current, ...Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined && value !== "")) };
  const encryptedValue = encryptRuntimeSettings(value);
  await executor.insert(applicationSettingsTable).values({ id: "runtime", encryptedValue, updatedAt: new Date(), updatedById: memberId ?? null }).onConflictDoUpdate({ target: applicationSettingsTable.id, set: { encryptedValue, updatedAt: new Date(), updatedById: memberId ?? null } });
  return value;
}
export function maskedStatus(settings: RuntimeSettings) {
  const present = (value?: string | number | boolean) => Boolean(value);
  const base = settings.publicBaseUrl ?? config.publicBaseUrl;
  const redirectUri = settings.adfsRedirectUri ?? config.oidc.redirectUri ?? (base ? `${base.replace(/\/+$/, "")}/api/auth/callback` : null);
  return {
    publicBaseUrl: settings.publicBaseUrl ?? config.publicBaseUrl ?? null,
    adfs: {
      enabled: settings.adfsEnabled ?? false,
      displayName: settings.adfsDisplayName ?? config.oidc.displayName,
      issuer: settings.adfsIssuer ?? config.oidc.issuer ?? null,
      discoveryUrl: settings.adfsDiscoveryUrl ?? config.oidc.discoveryUrl ?? null,
      clientId: settings.adfsClientId ?? config.oidc.clientId ?? null,
      clientSecretConfigured: present(settings.adfsClientSecret ?? config.oidc.clientSecret),
      redirectUri,
      scopes: settings.adfsScopes ?? config.oidc.scopes,
      usernameClaim: settings.adfsUsernameClaim ?? config.oidc.usernameClaim,
      emailClaim: settings.adfsEmailClaim ?? config.oidc.emailClaim,
      displayNameClaim: settings.adfsDisplayNameClaim ?? config.oidc.displayNameClaim,
      caCertificateConfigured: present(settings.adfsCaCertificate),
    },
    ldaps: { url: settings.ldapsUrl ?? config.ldap.url ?? null, bindDn: settings.ldapsBindDn ?? config.ldap.bindDn ?? null, bindPasswordConfigured: present(settings.ldapsBindPassword ?? config.ldap.bindPassword), baseDn: settings.ldapsBaseDn ?? config.ldap.baseDn ?? null, userFilter: settings.ldapsUserFilter ?? config.ldap.userFilter, caCertificateConfigured: present(settings.ldapsCaCertificate), cioGroupDn: settings.ldapsCioGroupDn ?? config.ldap.cioGroupDn ?? null },
    smtp: { host: settings.smtpHost ?? config.smtp.host ?? null, port: settings.smtpPort ?? config.smtp.port, secure: settings.smtpSecure ?? config.smtp.secure, user: settings.smtpUser ?? config.smtp.user ?? null, passwordConfigured: present(settings.smtpPassword ?? config.smtp.password), from: settings.smtpFrom ?? config.smtp.from ?? null, fromName: settings.smtpFromName ?? null },
  };
}