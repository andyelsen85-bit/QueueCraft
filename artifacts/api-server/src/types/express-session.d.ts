import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    authProvider?: "adfs" | "local" | "development";
    csrfToken?: string;
    oidcState?: string;
    oidcNonce?: string;
    oidcCodeVerifier?: string;
    returnTo?: string;
  }
}