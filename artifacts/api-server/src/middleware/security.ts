import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { db, membersTable, pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import { config } from "../config";

const PgSession = connectPgSimple(session);

export const sessionMiddleware = session({
  name: "queuecraft.sid",
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  proxy: config.production,
  store: new PgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: false,
  }),
  cookie: {
    httpOnly: true,
    secure: config.production,
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000,
  },
});

export const securityHeaders = helmet({
  crossOriginResourcePolicy: { policy: "same-site" },
});

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 240,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

export const breakGlassLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

export function ensureCsrfToken(req: Request) {
  req.session.csrfToken ??= randomBytes(32).toString("base64url");
  return req.session.csrfToken;
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    next();
    return;
  }
  if (req.path === "/auth/callback" || req.path === "/auth/ldap") {
    next();
    return;
  }
  const expected = req.session.csrfToken;
  const supplied = req.get("x-csrf-token");
  if (
    !expected ||
    !supplied ||
    expected.length !== supplied.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
  ) {
    res.status(403).json({ error: "Invalid CSRF token" });
    return;
  }
  next();
}

export async function requireAuthenticated(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session.userId && !config.production) {
    req.session.userId = "member-andy";
    req.session.authProvider = "development";
  }
  if (!req.session.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const [member] = await db
    .select({ status: membersTable.status })
    .from(membersTable)
    .where(eq(membersTable.id, req.session.userId))
    .limit(1);
  if (!member || member.status !== "active") {
    req.session.destroy(() => undefined);
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}