import * as oidc from "openid-client";
import { config, oidcConfigured } from "../config";

let discovered: Promise<oidc.Configuration> | undefined;

export function getOidcConfiguration() {
  if (!oidcConfigured || !config.oidc.issuer || !config.oidc.clientId) {
    throw new Error("AD FS OIDC is not configured");
  }
  discovered ??= oidc.discovery(
    new URL(config.oidc.issuer),
    config.oidc.clientId,
    config.oidc.clientSecret,
  );
  return discovered;
}

export async function createAuthorizationRequest() {
  const client = await getOidcConfiguration();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const url = oidc.buildAuthorizationUrl(client, {
    redirect_uri: config.oidc.redirectUri!,
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