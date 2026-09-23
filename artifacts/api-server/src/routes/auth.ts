import { Router, type IRouter, type Request } from "express";
import { eq, or } from "drizzle-orm";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db, membersTable } from "@workspace/db";
import { authLimiter, csrfProtection, ensureCsrfToken } from "../middleware/security";
import { config, ldapConfigured, oidcConfigured } from "../config";
import { getRuntimeSettings, maskedStatus } from "../services/application-settings";
import { createAuthorizationRequest, redeemAuthorizationCode } from "../services/oidc";
import { updateRuntimeSettings } from "../services/application-settings";

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
  if (
    member.externalSubject !== input.subject ||
    member.authProvider !== input.provider ||
    (input.provider === "ldaps" && member.isCio !== Boolean(input.isCio))
  ) {
    const [updated] = await db
      .update(membersTable)
      .set({
        externalSubject: input.subject,
        authProvider: input.provider,
        isCio: input.provider === "ldaps" ? Boolean(input.isCio) : member.isCio,
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
    ldaps: false,
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
    next(error);
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
      email: typeof claims.email === "string" ? claims.email : undefined,
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
    next(error);
  }
});

router.get("/auth/bootstrap", async (_req, res) => {
  const settings = await getRuntimeSettings();
  res.json({ required: !settings.adminPasswordHash });
});

const scrypt = promisify(scryptCallback);
router.post("/auth/bootstrap", authLimiter, async (req, res) => {
  const settings = await getRuntimeSettings();
  if (settings.adminPasswordHash) { res.status(409).json({ error: "Administrator password is already configured" }); return; }
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (password.length < 12) { res.status(400).json({ error: "Administrator password must be at least 12 characters" }); return; }
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  await updateRuntimeSettings({ adminPasswordHash: `${salt}:${derived.toString("hex")}` });
  res.status(201).json({ created: true });
});

router.post("/auth/local", authLimiter, async (req, res, next) => {
  try {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const settings = await getRuntimeSettings();
    const [salt, expectedHex] = (settings.adminPasswordHash ?? ":").split(":");
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    const expected = Buffer.from(expectedHex, "hex");
    if (!expected.length || expected.length !== derived.length || !timingSafeEqual(expected, derived)) {
      res.status(401).json({ error: "Invalid administrator credentials" }); return;
    }
    const [member] = await db.select().from(membersTable).where(eq(membersTable.id, "member-andy")).limit(1);
    if (!member) { res.status(500).json({ error: "Administrator member is not provisioned" }); return; }
    await regenerate(req);
    req.session.userId = member.id;
    req.session.authProvider = "local";
    res.json({ authenticated: true, csrfToken: ensureCsrfToken(req) });
  } catch (error) {
    req.log.warn({ err: error, username: req.body?.username }, "LDAPS authentication failed");
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