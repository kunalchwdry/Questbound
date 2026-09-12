import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// ---------------------------------------------------------------------------
// Server-side secret vault (AES-256-GCM)
//
// Per-user LLM API keys are encrypted before they touch Postgres and are
// never sent to the browser, logged, or echoed in error messages.
//
// The master key comes from APP_ENCRYPTION_KEY (set it in production — 32+
// random characters). When it is absent we deterministically derive one from
// server-only environment material, which still keeps keys confidential in a
// database dump (the derivation secret never lives in the database) but does
// NOT survive rotating those variables — set APP_ENCRYPTION_KEY explicitly.
// ---------------------------------------------------------------------------

const VERSION = "v1";
const APP_PEPPER = "questbound.key-vault.v1";

let cachedKey: Buffer | null = null;

function masterKey(): Buffer {
  if (cachedKey) return cachedKey;
  const configured = process.env.APP_ENCRYPTION_KEY?.trim();
  const secret =
    configured && configured.length >= 16
      ? configured
      : [
          APP_PEPPER,
          process.env.DATABASE_URL ?? "",
          process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        ].join("|");
  cachedKey = scryptSync(secret, APP_PEPPER, 32);
  return cachedKey;
}

/** Encrypt a UTF-8 secret → "v1:<ivB64>:<tagB64>:<cipherB64>". */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/** Decrypt an envelope produced by encryptSecret. Returns null on any failure. */
export function decryptSecret(envelope: string | null | undefined): string | null {
  if (!envelope) return null;
  try {
    const [version, ivB64, tagB64, dataB64] = envelope.split(":");
    if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      masterKey(),
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}
