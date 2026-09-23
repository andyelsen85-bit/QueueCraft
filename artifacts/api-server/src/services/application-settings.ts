import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { db } from "@workspace/db";
import { applicationSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { config } from "../config";

export type RuntimeSettings = {
  publicBaseUrl?: string; adfsEnabled?: boolean; adfsIssuer?: string; adfsClientId?: string; adfsClientSecret?: string; adfsCaCertificate?: string;
  ldapsUrl?: string; ldapsBindDn?: string; ldapsBindPassword?: string; ldapsBaseDn?: string; ldapsUserFilter?: string; ldapsCaCertificate?: string;
  smtpHost?: string; smtpPort?: number; smtpSecure?: boolean; smtpUser?: string; smtpPassword?: string; smtpFrom?: string; smtpFromName?: string;
  adminPasswordHash?: string;
  adminMemberId?: string;
};

const key = createHash("sha256").update(config.sessionSecret).digest();
function encrypt(value: RuntimeSettings) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${data.toString("base64")}`;
}
function decrypt(value: string): RuntimeSettings {
  const [iv, tag, data] = value.split(".").map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv); decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"));
}
export async function getRuntimeSettings(): Promise<RuntimeSettings> {
  const [row] = await db.select().from(applicationSettingsTable).where(eq(applicationSettingsTable.id, "runtime")).limit(1);
  return row ? decrypt(row.encryptedValue) : {};
}
export async function updateRuntimeSettings(update: Partial<RuntimeSettings>, memberId?: string) {
  const current = await getRuntimeSettings();
  const value = { ...current, ...Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined && value !== "")) };
  await db.insert(applicationSettingsTable).values({ id: "runtime", encryptedValue: encrypt(value), updatedAt: new Date(), updatedById: memberId ?? null }).onConflictDoUpdate({ target: applicationSettingsTable.id, set: { encryptedValue: encrypt(value), updatedAt: new Date(), updatedById: memberId ?? null } });
  return value;
}
export function maskedStatus(settings: RuntimeSettings) {
  const present = (value?: string | number | boolean) => Boolean(value);
  const base = settings.publicBaseUrl ?? config.publicBaseUrl;
  const redirectUri = base ? `${base.replace(/\/+$/, "")}/api/auth/callback` : null;
  return {
    publicBaseUrl: settings.publicBaseUrl ?? config.publicBaseUrl ?? null,
    adfs: { enabled: settings.adfsEnabled ?? false, issuer: settings.adfsIssuer ?? config.oidc.issuer ?? null, clientId: settings.adfsClientId ?? config.oidc.clientId ?? null, clientSecretConfigured: present(settings.adfsClientSecret ?? config.oidc.clientSecret), caCertificateConfigured: present(settings.adfsCaCertificate), redirectUri },
    ldaps: { url: settings.ldapsUrl ?? config.ldap.url ?? null, bindDn: settings.ldapsBindDn ?? config.ldap.bindDn ?? null, bindPasswordConfigured: present(settings.ldapsBindPassword ?? config.ldap.bindPassword), baseDn: settings.ldapsBaseDn ?? config.ldap.baseDn ?? null, userFilter: settings.ldapsUserFilter ?? config.ldap.userFilter, caCertificateConfigured: present(settings.ldapsCaCertificate) },
    smtp: { host: settings.smtpHost ?? config.smtp.host ?? null, port: settings.smtpPort ?? config.smtp.port, secure: settings.smtpSecure ?? config.smtp.secure, user: settings.smtpUser ?? config.smtp.user ?? null, passwordConfigured: present(settings.smtpPassword ?? config.smtp.password), from: settings.smtpFrom ?? config.smtp.from ?? null, fromName: settings.smtpFromName ?? null },
  };
}