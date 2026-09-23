import { Client } from "ldapts";
import { config, ldapConfigured } from "../config";
import { getRuntimeSettings } from "./application-settings";

function escapeFilter(value: string) {
  return value.replace(/[\\*()\0]/g, (character) => {
    const code = character.charCodeAt(0).toString(16).padStart(2, "0");
    return `\\${code}`;
  });
}

export async function authenticateWithLdaps(username: string, password: string) {
  const settings = await getRuntimeSettings();
  const ldap = {
    url: settings.ldapsUrl ?? config.ldap.url, bindDn: settings.ldapsBindDn ?? config.ldap.bindDn,
    bindPassword: settings.ldapsBindPassword ?? config.ldap.bindPassword, baseDn: settings.ldapsBaseDn ?? config.ldap.baseDn,
    userFilter: settings.ldapsUserFilter ?? config.ldap.userFilter, ca: settings.ldapsCaCertificate,
  };
  if (!(ldap.url && ldap.bindDn && ldap.bindPassword && ldap.baseDn)) throw new Error("LDAPS fallback is not configured");
  if (!username || !password) throw new Error("Username and password are required");

  const serviceClient = new Client({
    url: ldap.url,
    timeout: 8_000,
    connectTimeout: 8_000,
    tlsOptions: { rejectUnauthorized: true, ca: ldap.ca ? [ldap.ca] : undefined },
  });
  try {
    await serviceClient.bind(ldap.bindDn, ldap.bindPassword);
    const filter = ldap.userFilter.replace("{{username}}", escapeFilter(username));
    const result = await serviceClient.search(ldap.baseDn, {
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
      url: ldap.url,
      timeout: 8_000,
      connectTimeout: 8_000,
      tlsOptions: { rejectUnauthorized: true, ca: ldap.ca ? [ldap.ca] : undefined },
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
      isCio: false,
    };
  } finally {
    await serviceClient.unbind().catch(() => undefined);
  }
}

export async function searchLdapsUsers(search = "") {
  const settings = await getRuntimeSettings();
  const ldap = { url: settings.ldapsUrl ?? config.ldap.url, bindDn: settings.ldapsBindDn ?? config.ldap.bindDn, bindPassword: settings.ldapsBindPassword ?? config.ldap.bindPassword, baseDn: settings.ldapsBaseDn ?? config.ldap.baseDn, userFilter: settings.ldapsUserFilter ?? config.ldap.userFilter, ca: settings.ldapsCaCertificate };
  if (!(ldap.url && ldap.bindDn && ldap.bindPassword && ldap.baseDn)) throw new Error("LDAPS import is not configured");
  const client = new Client({ url: ldap.url, timeout: 8_000, connectTimeout: 8_000, tlsOptions: { rejectUnauthorized: true, ca: ldap.ca ? [ldap.ca] : undefined } });
  try {
    await client.bind(ldap.bindDn, ldap.bindPassword);
    const filter = search ? `(&(objectClass=user)(|(sAMAccountName=*${escapeFilter(search)}*)(mail=*${escapeFilter(search)}*)(displayName=*${escapeFilter(search)}*)))` : "(objectClass=user)";
    const result = await client.search(ldap.baseDn, { scope: "sub", filter, sizeLimit: 100, attributes: ["distinguishedName", "mail", "displayName", "sAMAccountName"] });
    return result.searchEntries.map((entry) => {
      const row = entry as Record<string, unknown>;
      return { subject: String(row.distinguishedName ?? row.dn ?? ""), email: String(row.mail ?? "").toLowerCase(), name: String(row.displayName ?? row.sAMAccountName ?? "") };
    }).filter((row) => row.subject && row.email && row.name);
  } finally { await client.unbind().catch(() => undefined); }
}