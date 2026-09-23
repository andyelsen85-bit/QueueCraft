import * as oidc from "openid-client";
import https from "node:https";
import { config, oidcConfigured } from "../config";
import { getRuntimeSettings } from "./application-settings";

let discovered: Promise<oidc.Configuration> | undefined;
let discoveryKey: string | undefined;

function fetchWithCa(input: string | URL | Request, init?: RequestInit, ca?: string): Promise<Response> {
  if (!ca) return fetch(input, init);
  return new Promise((resolve, reject) => {
    const url = new URL(input.toString());
    const request = https.request(url, { method: init?.method ?? "GET", headers: init?.headers as Record<string, string>, ca }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: response.headers as Record<string, string> })));
    });
    request.on("error", reject);
    if (init?.body) request.write(init.body);
    request.end();
  });
}

export async function getOidcConfiguration() {
  const settings = await getRuntimeSettings();
  const issuer = settings.adfsIssuer ?? config.oidc.issuer;
  const clientId = settings.adfsClientId ?? config.oidc.clientId;
  const clientSecret = settings.adfsClientSecret ?? config.oidc.clientSecret;
  const ca = settings.adfsCaCertificate;
  if (settings.adfsEnabled === false || !(issuer && clientId && (settings.publicBaseUrl ?? config.publicBaseUrl))) {
    throw new Error("AD FS OIDC is not configured");
  }
  const key = `${issuer}:${clientId}`;
  if (discoveryKey !== key) {
    discoveryKey = key;
    discovered = oidc.discovery(new URL(issuer), clientId, clientSecret, undefined, { [oidc.customFetch]: (input, init) => fetchWithCa(input, init, ca) });
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
    redirect_uri: `${(settings.publicBaseUrl ?? config.publicBaseUrl!).replace(/\/+$/, "")}/api/auth/callback`,
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