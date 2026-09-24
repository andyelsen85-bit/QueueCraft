import { createHash, createPrivateKey, createPublicKey, timingSafeEqual, X509Certificate } from "node:crypto";
import { chown, chmod, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getRuntimeSettings, type RuntimeSettings } from "./application-settings";

export type HttpsInput = {
  certificatePem?: string;
  privateKeyPem?: string;
  chainPem?: string;
  clearChain?: boolean;
};

export function httpsCertificateStatus(settings: RuntimeSettings) {
  let certificate: X509Certificate | null = null;
  if (settings.httpsCertificatePem) {
    try { certificate = new X509Certificate(settings.httpsCertificatePem); } catch { /* invalid stored material is not disclosed */ }
  }
  return {
    certificateInstalled: Boolean(certificate),
    privateKeyInstalled: Boolean(settings.httpsPrivateKeyPem),
    chainInstalled: Boolean(settings.httpsChainPem),
    subject: certificate?.subject ?? null,
    expiresAt: certificate?.validTo ?? null,
    fingerprint: certificate?.fingerprint256 ?? null,
    runtimeConfigured: Boolean(process.env["TLS_CERT_DIR"]),
  };
}

export function validateHttpsCertificate(input: HttpsInput, current: RuntimeSettings) {
  const certificatePem = input.certificatePem?.trim() || current.httpsCertificatePem;
  const privateKeyPem = input.privateKeyPem?.trim() || current.httpsPrivateKeyPem;
  const chainPem = input.clearChain ? "" : input.chainPem?.trim() || current.httpsChainPem || "";
  if (!certificatePem || !privateKeyPem) throw new Error("A PEM certificate and matching private key are required.");
  if ([certificatePem, privateKeyPem, chainPem].some((value) => value.length > 100_000)) {
    throw new Error("Certificate files are too large.");
  }
  try {
    const certificate = new X509Certificate(certificatePem);
    if (new Date(certificate.validFrom).getTime() > Date.now()) throw new Error("The certificate is not yet valid.");
    if (new Date(certificate.validTo).getTime() <= Date.now()) throw new Error("The certificate has expired.");
    if (current.publicBaseUrl?.startsWith("https://")) {
      const hostname = new URL(current.publicBaseUrl).hostname;
      const matches = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
        ? certificate.checkIP(hostname)
        : certificate.checkHost(hostname);
      if (!matches) throw new Error(`The certificate does not cover the configured public hostname (${hostname}).`);
    }
    const key = createPrivateKey(privateKeyPem);
    const certificateKey = certificate.publicKey.export({ type: "spki", format: "der" });
    const privatePublicKey = createPublicKey(key).export({ type: "spki", format: "der" });
    if (certificateKey.length !== privatePublicKey.length || !timingSafeEqual(certificateKey, privatePublicKey)) {
      throw new Error("The private key does not match the certificate.");
    }
    if (chainPem) {
      const blocks = chainPem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
      if (!blocks || blocks.join("").replace(/\s/g, "") !== chainPem.replace(/\s/g, "")) {
        throw new Error("The certificate chain must contain PEM certificates only.");
      }
      let issued = certificate;
      for (const block of blocks) {
        const issuer = new X509Certificate(block);
        if (!issued.checkIssued(issuer) || !issued.verify(issuer.publicKey)) {
          throw new Error("The certificate chain is not ordered from leaf to issuing CA.");
        }
        issued = issuer;
      }
    }
  } catch (error) {
    throw new Error(error instanceof Error ? `Invalid HTTPS certificate: ${error.message}` : "Invalid HTTPS certificate.");
  }
  return { certificatePem, privateKeyPem, chainPem };
}

async function atomicWrite(path: string, contents: string, mode: number) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, contents, { mode });
  try {
    // The deployment sets TLS_CERT_GID to the Nginx/fsGroup ID; do not change ownership in local previews.
    if (process.env["TLS_CERT_GID"]) {
      await chown(temporary, process.getuid?.() ?? 10001, Number(process.env["TLS_CERT_GID"]));
    }
    await chmod(temporary, mode);
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function installHttpsCertificate(settings: RuntimeSettings, waitForReload = false) {
  const directory = process.env["TLS_CERT_DIR"];
  if (!directory) return false;
  const { certificatePem, privateKeyPem, chainPem } = validateHttpsCertificate({}, settings);
  // The web sidecar checks the pair and reloads only after the certificate has been replaced.
  const fullChain = `${certificatePem.trim()}\n${chainPem ? `${chainPem.trim()}\n` : ""}`;
  const expectedHash = createHash("sha256").update(fullChain).digest("hex");
  const acknowledgement = join(directory, ".tls-applied.sha256");
  if (waitForReload) await rm(acknowledgement, { force: true });
  await atomicWrite(join(directory, "tls.key"), `${privateKeyPem.trim()}\n`, 0o640);
  await atomicWrite(join(directory, "tls.crt"), fullChain, 0o644);
  if (waitForReload) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if ((await readFile(acknowledgement, "utf8").catch(() => "")).trim() === expectedHash) return true;
      await delay(250);
    }
    throw new Error("The web server did not confirm a successful HTTPS certificate reload.");
  }
  return true;
}

export async function restoreHttpsCertificate() {
  if (!process.env["TLS_CERT_DIR"]) return;
  const settings = await getRuntimeSettings();
  if (settings.httpsCertificatePem && settings.httpsPrivateKeyPem) await installHttpsCertificate(settings);
}