import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { describe, test } from "node:test";
import { config, resolveEncryptionKey } from "./config";
import { decryptRuntimeSettings, encryptRuntimeSettings } from "./services/application-settings";

describe("QueueCraft encryption key handling", () => {
  test("rejects equivalent hex and base64url encodings of SESSION_SECRET material", () => {
    const material = randomBytes(32);
    const hex = material.toString("hex");
    const base64url = material.toString("base64url");
    assert.throws(() => resolveEncryptionKey(hex, base64url, true), /independent/);
    assert.throws(() => resolveEncryptionKey(base64url, hex, true), /independent/);
  });

  test("migrates legacy settings ciphertext to versioned v2 encryption", () => {
    const legacyKey = createHash("sha256").update(config.sessionSecret).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", legacyKey, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify({ smtpHost: "legacy.example" }), "utf8"), cipher.final()]);
    const legacy = `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${data.toString("base64")}`;

    const migrated = decryptRuntimeSettings(legacy);
    assert.deepEqual(migrated.settings, { smtpHost: "legacy.example" });
    assert.equal(migrated.migrated, true);

    const versioned = encryptRuntimeSettings(migrated.settings);
    assert.match(versioned, /^v2\.[^.]+\.[^.]+\.[^.]+$/);
    assert.deepEqual(decryptRuntimeSettings(versioned), {
      settings: { smtpHost: "legacy.example" },
      migrated: false,
    });
  });
});