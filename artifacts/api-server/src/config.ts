const production = process.env.NODE_ENV === "production";

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

export const config = {
  production,
  sessionSecret,
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
