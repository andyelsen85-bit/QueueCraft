import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    authProvider?: "adfs" | "ldaps" | "development";
    csrfToken?: string;
    oidcState?: string;
    oidcNonce?: string;
    oidcCodeVerifier?: string;
    returnTo?: string;
  }
}