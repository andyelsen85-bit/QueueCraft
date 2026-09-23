import * as oidc from "openid-client";
import http from "node:http";
import https from "node:https";
import { rootCertificates } from "node:tls";
import { config, oidcConfigured } from "../config";
import { getRuntimeSettings } from "./application-settings";

let discovered: Promise<oidc.Configuration> | undefined;
let discoveryKey: string | undefined;

export function serializeOidcRequestBody(body: unknown): string | Buffer | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string" || Buffer.isBuffer(body)) return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  throw new TypeError("The OIDC request body type is unsupported");
}

function fetchWithCa(input: string | URL | Request, init?: RequestInit, ca?: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const url = new URL(input.toString());
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(url, {
      method: init?.method ?? "GET",
      headers: init?.headers as Record<string, string>,
      agent: url.protocol === "https:" ? new https.Agent({ ca: ca ? [...rootCertificates, ca] : [...rootCertificates] }) : undefined,
      signal: init?.signal ?? undefined,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: response.headers as Record<string, string> })));
    });
    request.on("error", reject);
    const body = serializeOidcRequestBody(init?.body);
    if (body !== undefined) request.write(body);
    request.end();
  });
}

function effective(settings: Awaited<ReturnType<typeof getRuntimeSettings>>) {
  const scopes = (settings.adfsScopes ?? config.oidc.scopes).trim().split(/\s+/).filter(Boolean);
  if (!scopes.includes("openid")) scopes.unshift("openid");
  return {
    issuer: settings.adfsIssuer ?? config.oidc.issuer,
    discoveryUrl: settings.adfsDiscoveryUrl ?? config.oidc.discoveryUrl,
    clientId: settings.adfsClientId ?? config.oidc.clientId,
    clientSecret: settings.adfsClientSecret ?? config.oidc.clientSecret,
    redirectUri: settings.adfsRedirectUri ?? config.oidc.redirectUri
      ?? ((settings.publicBaseUrl ?? config.publicBaseUrl)
        ? `${(settings.publicBaseUrl ?? config.publicBaseUrl!).replace(/\/+$/, "")}/api/auth/callback`
        : undefined),
    scopes: scopes.join(" "),
    ca: settings.adfsCaCertificate,
  };
}

export async function getOidcConfiguration() {
  const settings = await getRuntimeSettings();
  const current = effective(settings);
  if (settings.adfsEnabled === false || !(current.issuer && current.clientId && current.redirectUri)) {
    throw new Error("AD FS OIDC is not configured");
  }
  const key = [current.issuer, current.discoveryUrl, current.clientId, current.clientSecret ?? "", current.ca ?? ""].join("\u0000");
  if (discoveryKey !== key) {
    discoveryKey = key;
    const clientAuth = current.clientSecret ? oidc.ClientSecretPost(current.clientSecret) : oidc.None();
    const customFetch = (input: string | URL | Request, init?: RequestInit) => fetchWithCa(input, init, current.ca);
    if (current.discoveryUrl) {
      discovered = customFetch(current.discoveryUrl, { headers: { accept: "application/json" } }).then(async (response) => {
        if (!response.ok) throw new Error(`AD FS discovery returned HTTP ${response.status}`);
        const metadata = await response.json() as Record<string, unknown>;
        const actualIssuer = typeof metadata.issuer === "string" ? new URL(metadata.issuer).toString().replace(/\/$/, "") : "";
        const expectedIssuer = new URL(current.issuer!).toString().replace(/\/$/, "");
        if (actualIssuer !== expectedIssuer) throw new Error("AD FS discovery issuer does not match the configured issuer");
        const configuration = new oidc.Configuration(metadata as never, current.clientId!, undefined, clientAuth);
        configuration[oidc.customFetch] = customFetch;
        return configuration;
      });
    } else {
      discovered = oidc.discovery(new URL(current.issuer), current.clientId, undefined, clientAuth, { [oidc.customFetch]: customFetch });
    }
  }
  return discovered!;
}

export function clearOidcConfigurationCache() {
  discovered = undefined;
  discoveryKey = undefined;
}

export function oidcDiagnosticCode(error: unknown) {
  const candidate = error as { code?: unknown; cause?: { code?: unknown }; message?: unknown };
  const systemCode = candidate?.code ?? candidate?.cause?.code;
  if (typeof systemCode === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(systemCode)) return systemCode;
  const message = typeof candidate?.message === "string" ? candidate.message : "";
  if (message.includes("discovery issuer does not match")) return "DISCOVERY_ISSUER_MISMATCH";
  if (message.includes("discovery returned HTTP")) return "DISCOVERY_HTTP_ERROR";
  if (message.includes("body type is unsupported")) return "OIDC_UNSUPPORTED_REQUEST_BODY";
  return "OIDC_CONFIGURATION_ERROR";
}

export async function createAuthorizationRequest() {
  const [client, settings] = await Promise.all([getOidcConfiguration(), getRuntimeSettings()]);
  const current = effective(settings);
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const url = oidc.buildAuthorizationUrl(client, {
    redirect_uri: current.redirectUri!,
    response_type: "code",
    scope: current.scopes,
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
  const [client, settings] = await Promise.all([getOidcConfiguration(), getRuntimeSettings()]);
  const current = effective(settings);
  const tokens = await oidc.authorizationCodeGrant(client, currentUrl, {
    pkceCodeVerifier: expected.codeVerifier,
    expectedState: expected.state,
    expectedNonce: expected.nonce,
    idTokenExpected: true,
  }, { redirect_uri: current.redirectUri! });
  return tokens.claims();
}
