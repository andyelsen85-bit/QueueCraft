import { Router, type IRouter, type Request } from "express";
import { and, eq, or } from "drizzle-orm";
import { db, membersTable } from "@workspace/db";
import { authLimiter, csrfProtection, ensureCsrfToken } from "../middleware/security";
import { config, ldapConfigured, oidcConfigured } from "../config";
import { authenticateWithLdaps } from "../services/ldaps";
import { createAuthorizationRequest, redeemAuthorizationCode } from "../services/oidc";

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

router.get("/auth/providers", (_req, res) => {
  res.json({
    adfs: oidcConfigured,
    ldaps: ldapConfigured,
    developmentPreview: !config.production,
  });
});

router.get("/auth/csrf", (req, res) => {
  res.json({ csrfToken: ensureCsrfToken(req) });
});

router.get("/auth/login", authLimiter, async (req, res, next) => {
  try {
    if (!oidcConfigured) {
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
    const base = config.publicBaseUrl ?? `${req.protocol}://${req.get("host")}`;
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

router.post("/auth/ldap", authLimiter, async (req, res, next) => {
  try {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const identity = await authenticateWithLdaps(username, password);
    const member = await resolveMember({
      subject: identity.subject,
      email: identity.email,
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