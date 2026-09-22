import * as oidc from "openid-client";
import { config, oidcConfigured } from "../config";
import { getRuntimeSettings } from "./application-settings";

let discovered: Promise<oidc.Configuration> | undefined;
let discoveryKey: string | undefined;

export async function getOidcConfiguration() {
  const settings = await getRuntimeSettings();
  const issuer = settings.adfsIssuer ?? config.oidc.issuer;
  const clientId = settings.adfsClientId ?? config.oidc.clientId;
  const clientSecret = settings.adfsClientSecret ?? config.oidc.clientSecret;
  if (!(issuer && clientId && (settings.adfsRedirectUri ?? config.oidc.redirectUri))) {
    throw new Error("AD FS OIDC is not configured");
  }
  const key = `${issuer}:${clientId}`;
  if (discoveryKey !== key) {
    discoveryKey = key;
    discovered = oidc.discovery(new URL(issuer), clientId, clientSecret);
  }
  return discovered!;
}

export async function createAuthorizationRequest() {
  const [client, settings] = await Promise.all([getOidcConfiguration(), getRuntimeSettings()]);
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const url = oidc.buildAuthorizationUrl(client, {
    redirect_uri: settings.adfsRedirectUri ?? config.oidc.redirectUri!,
    response_type: "code",
    scope: "openid profile email",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });
  return { url, state, nonce, codeVerifier };
}

export async function redeemAuthorizationCode(
  currentUrl: URL,
  expected: { state: string; nonce: string; codeVerifier: string },
) {
  const client = await getOidcConfiguration();
  const tokens = await oidc.authorizationCodeGrant(client, currentUrl, {
    pkceCodeVerifier: expected.codeVerifier,
    expectedState: expected.state,
    expectedNonce: expected.nonce,
    idTokenExpected: true,
  });
  return tokens.claims();
}