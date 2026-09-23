import { timingSafeEqual } from "node:crypto";

const production = process.env.NODE_ENV === "production";
const developmentEncryptionKey = Buffer.from("queuecraft-dev-encryption-key-32b!").subarray(0, 32);
const placeholderSecrets = new Set([
  "change-me",
  "changeme",
  "your-secret-here",
  "replace-me",
  "queuecraft-development-only-encryption-key-32",
]);

function optional(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function requiredInProduction(name: string, minimumLength = 1) {
  const value = optional(name);
  if (production && (!value || value.length < minimumLength)) {
    throw new Error(`${name} is required in production and must be at least ${minimumLength} characters`);
  }
  return value;
}

const sessionSecret =
  requiredInProduction("SESSION_SECRET", 32) ??
  "queuecraft-development-only-session-secret-change-me";

export function resolveEncryptionKey(
  value: string | undefined,
  sessionSecretValue: string,
  productionMode: boolean,
) {
  if (!value) {
    if (productionMode) throw new Error("APP_ENCRYPTION_KEY is required in production");
    return developmentEncryptionKey;
  }
  if (placeholderSecrets.has(value.toLowerCase())) {
    throw new Error("APP_ENCRYPTION_KEY must not be a placeholder");
  }
  const hex = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : undefined;
  let decoded: Buffer | undefined = hex;
  if (!decoded) {
    try {
      if (!/^[A-Za-z0-9_-]{43}=?$/.test(value)) throw new Error("invalid base64url");
      const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
      decoded = Buffer.from(normalized, "base64");
    } catch {
      decoded = undefined;
    }
  }
  if (!decoded || decoded.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY must encode exactly 32 random bytes as hex or base64url");
  }
  const sessionMaterial = /^[0-9a-f]{64}$/i.test(sessionSecretValue)
    ? Buffer.from(sessionSecretValue, "hex")
    : /^[A-Za-z0-9_-]{43}=?$/.test(sessionSecretValue)
      ? Buffer.from(sessionSecretValue.replace(/-/g, "+").replace(/_/g, "/"), "base64")
      : Buffer.from(sessionSecretValue, "utf8");
  if (sessionMaterial.length === decoded.length && timingSafeEqual(decoded, sessionMaterial)) {
    throw new Error("APP_ENCRYPTION_KEY must be independent from SESSION_SECRET");
  }
  return decoded;
}

const configuredEncryptionKey = optional("APP_ENCRYPTION_KEY");
const appEncryptionKey = resolveEncryptionKey(
  configuredEncryptionKey,
  sessionSecret,
  production,
);

export const config = {
  production,
  sessionSecret,
  appEncryptionKey,
  publicBaseUrl: optional("PUBLIC_BASE_URL"),
  oidc: {
    issuer: optional("ADFS_ISSUER_URL"),
    clientId: optional("ADFS_CLIENT_ID"),
    clientSecret: optional("ADFS_CLIENT_SECRET"),
    redirectUri: optional("ADFS_REDIRECT_URI"),
  },
  ldap: {
    url: optional("LDAPS_URL"),
    bindDn: optional("LDAPS_BIND_DN"),
    bindPassword: optional("LDAPS_BIND_PASSWORD"),
    baseDn: optional("LDAPS_BASE_DN"),
    userFilter: optional("LDAPS_USER_FILTER") ?? "(sAMAccountName={{username}})",
    cioGroupDn: optional("LDAPS_CIO_GROUP_DN"),
  },
  smtp: {
    host: optional("SMTP_HOST"),
    port: Number(optional("SMTP_PORT") ?? 587),
    secure: optional("SMTP_SECURE") === "true",
    user: optional("SMTP_USER"),
    password: optional("SMTP_PASSWORD"),
    from: optional("SMTP_FROM") ?? "queuecraft@localhost",
  },
};

export const oidcConfigured = Boolean(
  config.oidc.issuer && config.oidc.clientId && config.oidc.redirectUri,
);

export const ldapConfigured = Boolean(
  config.ldap.url &&
    config.ldap.bindDn &&
    config.ldap.bindPassword &&
    config.ldap.baseDn,
);

export const smtpConfigured = Boolean(config.smtp.host);
