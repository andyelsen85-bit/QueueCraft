import { Client } from "ldapts";
import { config, ldapConfigured } from "../config";

function escapeFilter(value: string) {
  return value.replace(/[\\*()\0]/g, (character) => {
    const code = character.charCodeAt(0).toString(16).padStart(2, "0");
    return `\\${code}`;
  });
}

export async function authenticateWithLdaps(username: string, password: string) {
  if (!ldapConfigured) throw new Error("LDAPS fallback is not configured");
  if (!username || !password) throw new Error("Username and password are required");

  const serviceClient = new Client({
    url: config.ldap.url!,
    timeout: 8_000,
    connectTimeout: 8_000,
    tlsOptions: { rejectUnauthorized: true },
  });
  try {
    await serviceClient.bind(config.ldap.bindDn!, config.ldap.bindPassword!);
    const filter = config.ldap.userFilter.replace("{{username}}", escapeFilter(username));
    const result = await serviceClient.search(config.ldap.baseDn!, {
      scope: "sub",
      filter,
      sizeLimit: 2,
      attributes: ["distinguishedName", "mail", "displayName", "memberOf", "userAccountControl"],
    });
    if (result.searchEntries.length !== 1) throw new Error("Invalid credentials");
    const entry = result.searchEntries[0] as Record<string, unknown>;
    const dn = String(entry.distinguishedName ?? entry.dn ?? "");
    const flags = Number(entry.userAccountControl ?? 0);
    if (!dn || (flags & 2) === 2) throw new Error("Account is disabled");

    const userClient = new Client({
      url: config.ldap.url!,
      timeout: 8_000,
      connectTimeout: 8_000,
      tlsOptions: { rejectUnauthorized: true },
    });
    try {
      await userClient.bind(dn, password);
    } finally {
      await userClient.unbind().catch(() => undefined);
    }

    const groups = Array.isArray(entry.memberOf)
      ? entry.memberOf.map(String)
      : entry.memberOf
        ? [String(entry.memberOf)]
        : [];
    return {
      subject: dn,
      email: String(entry.mail ?? "").toLowerCase(),
      name: String(entry.displayName ?? username),
      isCio: Boolean(config.ldap.cioGroupDn && groups.includes(config.ldap.cioGroupDn)),
    };
  } finally {
    await serviceClient.unbind().catch(() => undefined);
  }
}