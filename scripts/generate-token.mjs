import crypto from "node:crypto";

const REQUIRED_SECRET_BYTES = 32;
const DEFAULT_TTL_SECONDS = 3600;
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 3600 * 12;

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    fail(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseTtlSeconds() {
  const raw = process.env.IDENTITY_JWT_TTL_SECONDS;
  if (!raw) return DEFAULT_TTL_SECONDS;

  if (!/^\d+$/.test(raw)) {
    fail("IDENTITY_JWT_TTL_SECONDS must be a whole number of seconds");
  }

  const ttl = Number(raw);
  if (!Number.isSafeInteger(ttl) || ttl < MIN_TTL_SECONDS || ttl > MAX_TTL_SECONDS) {
    fail(
      `IDENTITY_JWT_TTL_SECONDS must be between ${MIN_TTL_SECONDS} and ${MAX_TTL_SECONDS} seconds`,
    );
  }

  return ttl;
}

function base64urlEncode(value) {
  const source = typeof value === "string" ? value : JSON.stringify(value);
  return Buffer.from(source)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, "base64").toString("utf8");
}

const secret = requireEnv("IDENTITY_JWT_SECRET");
const issuer = requireEnv("IDENTITY_JWT_ISSUER");
const audience = requireEnv("IDENTITY_JWT_AUDIENCE");
const subject = requireEnv("IDENTITY_JWT_SUBJECT");
const ttlSeconds = parseTtlSeconds();

if (Buffer.byteLength(secret, "utf8") < REQUIRED_SECRET_BYTES) {
  fail(`IDENTITY_JWT_SECRET must be at least ${REQUIRED_SECRET_BYTES} bytes long`);
}

const nowSeconds = Math.floor(Date.now() / 1000);
const claims = {
  sub: subject,
  iss: issuer,
  aud: audience,
  iat: nowSeconds,
  exp: nowSeconds + ttlSeconds,
};

const header = {
  alg: "HS256",
  typ: "JWT",
};

const encodedHeader = base64urlEncode(header);
const encodedClaims = base64urlEncode(claims);
const signingInput = `${encodedHeader}.${encodedClaims}`;

const signature = crypto
  .createHmac("sha256", secret)
  .update(signingInput)
  .digest("base64")
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/g, "");

const token = `${signingInput}.${signature}`;

if (process.env.IDENTITY_JWT_PRINT_DEBUG === "1") {
  const parsed = JSON.parse(base64urlDecode(encodedClaims));
  console.error(
    JSON.stringify(
      {
        issuer,
        audience,
        subject,
        ttlSeconds,
        issuedAt: parsed.iat,
        expiresAt: parsed.exp,
      },
      null,
      2,
    ),
  );
}

process.stdout.write(`${token}\n`);
