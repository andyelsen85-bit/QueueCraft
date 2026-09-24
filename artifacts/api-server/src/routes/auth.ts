import { Router, type IRouter, type Request } from "express";
import { eq, or, sql } from "drizzle-orm";
import { db, membersTable } from "@workspace/db";
import { authLimiter, csrfProtection, ensureCsrfToken, requireAuthenticated } from "../middleware/security";
import { config, ldapConfigured, oidcConfigured } from "../config";
import { getRuntimeSettings, maskedStatus } from "../services/application-settings";
import { createAuthorizationRequest, oidcDiagnosticCode, redeemAuthorizationCode } from "../services/oidc";
import { updateRuntimeSettings } from "../services/application-settings";
import { authenticateWithLdaps } from "../services/ldaps";
import { hashLocalPassword, verifyLocalPassword } from "../services/local-password";

const router: IRouter = Router();

function safeReturnTo(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

function regenerate(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

async function resolveMember(input: {
  subject: string;
  email?: string;
  provider: "adfs" | "ldaps";
  isCio?: boolean;
}) {
  const normalizedEmail = input.email?.trim().toLowerCase();
  const [member] = await db
    .select()
    .from(membersTable)
    .where(
      normalizedEmail
        ? or(
            eq(membersTable.externalSubject, input.subject),
            eq(membersTable.email, normalizedEmail),
          )
        : eq(membersTable.externalSubject, input.subject),
    )
    .limit(1);
  if (!member || member.status !== "active") return null;
  // An account provisioned for local authentication must never be claimed by
  // an external identity merely because its email or subject matches.
  if (member.authProvider === "local") return null;
  if (
    member.externalSubject !== input.subject ||
    member.authProvider !== input.provider ||
    (input.provider === "ldaps" && input.isCio !== undefined && member.cioOverride === null && member.isCio !== input.isCio)
  ) {
    const [updated] = await db
      .update(membersTable)
      .set({
        externalSubject: input.subject,
        authProvider: input.provider,
        isCio: input.provider === "ldaps" && input.isCio !== undefined && member.cioOverride === null ? input.isCio : member.isCio,
      })
      .where(eq(membersTable.id, member.id))
      .returning();
    return updated;
  }
  return member;
}

router.get("/auth/providers", async (_req, res) => {
  const settings = maskedStatus(await getRuntimeSettings());
  res.json({
    adfs: Boolean(settings.adfs.enabled && settings.adfs.issuer && settings.adfs.clientId && settings.adfs.redirectUri),
    adfsDisplayName: settings.adfs.displayName,
    ldaps: Boolean(settings.ldaps.url && settings.ldaps.bindDn && settings.ldaps.bindPasswordConfigured && settings.ldaps.baseDn),
    developmentPreview: !config.production,
  });
});

router.get("/auth/csrf", (req, res) => {
  res.json({ csrfToken: ensureCsrfToken(req) });
});

router.get("/auth/login", authLimiter, async (req, res, next) => {
  try {
    const providers = await getRuntimeSettings();
    if (!providers.adfsEnabled) {
      res.status(503).json({ error: "AD FS authentication is not configured" });
      return;
    }
    const request = await createAuthorizationRequest();
    req.session.oidcState = request.state;
    req.session.oidcNonce = request.nonce;
    req.session.oidcCodeVerifier = request.codeVerifier;
    req.session.returnTo = safeReturnTo(req.query.returnTo);
    res.redirect(request.url.href);
  } catch (error) {
    const diagnosticCode = oidcDiagnosticCode(error);
    req.log.error({ diagnosticCode }, "AD FS authorization request failed");
    res.redirect(`/login?adfsError=${encodeURIComponent(diagnosticCode)}`);
  }
});

router.get("/auth/callback", authLimiter, async (req, res, next) => {
  try {
    const { oidcState, oidcNonce, oidcCodeVerifier } = req.session;
    if (!oidcState || !oidcNonce || !oidcCodeVerifier) {
      res.status(400).json({ error: "Authentication transaction expired" });
      return;
    }
    const runtimeSettings = await getRuntimeSettings();
    const base = runtimeSettings.publicBaseUrl ?? config.publicBaseUrl ?? `${req.protocol}://${req.get("host")}`;
    const currentUrl = new URL(req.originalUrl, base);
    const claims = await redeemAuthorizationCode(currentUrl, {
      state: oidcState,
      nonce: oidcNonce,
      codeVerifier: oidcCodeVerifier,
    });
    const subject = claims?.sub;
    if (!subject) {
      res.status(401).json({ error: "AD FS did not return a subject claim" });
      return;
    }
    const member = await resolveMember({
      subject,
      email: typeof claims[runtimeSettings.adfsEmailClaim ?? config.oidc.emailClaim] === "string"
        ? String(claims[runtimeSettings.adfsEmailClaim ?? config.oidc.emailClaim])
        : undefined,
      provider: "adfs",
    });
    if (!member) {
      res.status(403).json({ error: "Authenticated user is not provisioned in QueueCraft" });
      return;
    }
    const returnTo = safeReturnTo(req.session.returnTo);
    await regenerate(req);
    req.session.userId = member.id;
    req.session.authProvider = "adfs";
    ensureCsrfToken(req);
    res.redirect(returnTo);
  } catch (error) {
    const diagnosticCode = oidcDiagnosticCode(error);
    req.log.error({ diagnosticCode }, "AD FS callback failed");
    res.redirect(`/login?adfsError=${encodeURIComponent(diagnosticCode)}`);
  }
});

router.get("/auth/bootstrap", async (_req, res) => {
  const settings = await getRuntimeSettings();
  res.json({ required: !settings.adminPasswordHash });
});

router.post("/auth/bootstrap", authLimiter, async (req, res) => {
  const settings = await getRuntimeSettings();
  if (settings.adminPasswordHash) { res.status(409).json({ error: "Administrator password is already configured" }); return; }
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (password.length < 12) { res.status(400).json({ error: "Administrator password must be at least 12 characters" }); return; }
   const passwordHash = await hashLocalPassword(password);
  const adminId = "local-admin";
  const [existingAdmin] = await db.select().from(membersTable).where(eq(membersTable.id, adminId)).limit(1);
  if (!existingAdmin) {
    await db.insert(membersTable).values({
      id: adminId,
      name: "QueueCraft Administrator",
      initials: "QA",
      email: "queuecraft-admin@localhost.invalid",
      title: "System Administrator",
      authProvider: "local",
      status: "active",
      isCio: true,
      passwordHash,
    });
   } else {
     await db.update(membersTable).set({ passwordHash, authProvider: "local", status: "active" }).where(eq(membersTable.id, adminId));
  }
   await updateRuntimeSettings({ adminPasswordHash: passwordHash, adminMemberId: adminId });
  res.status(201).json({ created: true });
});

router.post("/auth/local", authLimiter, async (req, res, next) => {
  try {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const settings = await getRuntimeSettings();
    const adminId = settings.adminMemberId ?? "local-admin";
    const normalizedUsername = username.toLowerCase();
    const [member] = await db.select().from(membersTable).where(
      normalizedUsername === "admin" ? eq(membersTable.id, adminId) : eq(membersTable.email, normalizedUsername),
    ).limit(1);
    if (!member || member.status !== "active" || member.authProvider !== "local") {
      res.status(401).json({ error: "Invalid local credentials" }); return;
    }
    let valid = member.passwordHash ? await verifyLocalPassword(password, member.passwordHash) : false;
    if (!member.passwordHash && !valid && member.id === adminId && settings.adminPasswordHash) {
      valid = await verifyLocalPassword(password, settings.adminPasswordHash);
      if (valid) await db.update(membersTable).set({ passwordHash: settings.adminPasswordHash }).where(eq(membersTable.id, member.id));
    }
    if (!valid) { res.status(401).json({ error: "Invalid local credentials" }); return; }
    await regenerate(req);
    req.session.userId = member.id;
    req.session.authProvider = "local";
    res.json({ authenticated: true, csrfToken: ensureCsrfToken(req) });
  } catch (error) {
    req.log.warn({ err: error, username: req.body?.username }, "Local authentication failed");
    res.status(401).json({ error: "Authentication failed" });
  }
});

router.patch("/auth/password", authLimiter, csrfProtection, requireAuthenticated, async (req, res) => {
  if (req.session.authProvider !== "local") {
    res.status(403).json({ error: "Password is managed by your directory provider" });
    return;
  }
  const oldPassword = typeof req.body?.oldPassword === "string" ? req.body.oldPassword : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (newPassword.length < 12 || newPassword.length > 256) {
    res.status(400).json({ error: "New password must be 12–256 characters" });
    return;
  }
  const [member] = await db.select().from(membersTable).where(eq(membersTable.id, req.session.userId!)).limit(1);
  if (!member || member.status !== "active") { res.status(401).json({ error: "Authentication required" }); return; }
  let valid = member.passwordHash ? await verifyLocalPassword(oldPassword, member.passwordHash) : false;
  if (!member.passwordHash && !valid && member.id === "local-admin") {
    const settings = await getRuntimeSettings();
    valid = Boolean(settings.adminPasswordHash && await verifyLocalPassword(oldPassword, settings.adminPasswordHash));
  }
  if (!valid) { res.status(400).json({ error: "Current password is incorrect" }); return; }
  const passwordHash = await hashLocalPassword(newPassword);
  await db.update(membersTable).set({ passwordHash }).where(eq(membersTable.id, member.id));
  if (member.id === "local-admin") await updateRuntimeSettings({ adminPasswordHash: passwordHash, adminMemberId: member.id }, member.id);
  await db.execute(sql`
    DELETE FROM user_sessions
    WHERE sess ->> 'userId' = ${member.id} AND sid <> ${req.sessionID}
  `);
  await regenerate(req);
  req.session.userId = member.id;
  req.session.authProvider = "local";
  ensureCsrfToken(req);
  res.json({ updated: true });
});

router.post("/auth/ldap", authLimiter, async (req, res, next) => {
  try {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!username || !password) {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }
    const identity = await authenticateWithLdaps(username, password);
    const member = await resolveMember({
      subject: identity.subject,
      email: identity.email || undefined,
      provider: "ldaps",
      isCio: identity.isCio,
    });
    if (!member) {
      res.status(403).json({ error: "Authenticated user is not provisioned in QueueCraft" });
      return;
    }
    await regenerate(req);
    req.session.userId = member.id;
    req.session.authProvider = "ldaps";
    res.json({ authenticated: true, csrfToken: ensureCsrfToken(req) });
  } catch (error) {
    req.log.warn({ err: error }, "LDAPS authentication failed");
    res.status(401).json({ error: "Authentication failed" });
  }
});

router.post("/auth/logout", csrfProtection, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) {
      next(error);
      return;
    }
    res.clearCookie("queuecraft.sid");
    res.status(204).end();
  });
});

export default router;