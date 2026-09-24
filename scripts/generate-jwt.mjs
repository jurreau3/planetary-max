#!/usr/bin/env node
import crypto from "node:crypto";
import process from "node:process";

const DEFAULT_SUBJECT = "max";
const DEFAULT_TTL_SECONDS = 60 * 60;

function usage() {
  console.log(`Usage: node scripts/generate-jwt.mjs [options]

Generates a signed HS256 JWT for local development only.

Options:
  --secret <value>        HMAC secret (or set IDENTITY_JWT_SECRET)
  --issuer <value>        JWT issuer (or set IDENTITY_JWT_ISSUER)
  --audience <value>      JWT audience (or set IDENTITY_JWT_AUDIENCE)
  --sub <value>           Subject claim (default: "max")
  --ttl <seconds>         Expiry offset in seconds (default: 3600)
  --help                  Show help

Security notes:
  - Never commit the secret to git.
  - Prefer environment variables or a secret manager.
  - Use a secret at least 32 characters long.
`);
}

function parseArgs(argv) {
  const opts = {
    secret: process.env.IDENTITY_JWT_SECRET ?? "",
    issuer: process.env.IDENTITY_JWT_ISSUER ?? "",
    audience: process.env.IDENTITY_JWT_AUDIENCE ?? "",
    sub: process.env.JWT_SUB ?? DEFAULT_SUBJECT,
    ttl: Number(process.env.IDENTITY_JWT_TTL_SECONDS ?? DEFAULT_TTL_SECONDS),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case "--secret":
        opts.secret = argv[i + 1] ?? "";
        i += 1;
        break;
      case "--issuer":
        opts.issuer = argv[i + 1] ?? "";
        i += 1;
        break;
      case "--audience":
        opts.audience = argv[i + 1] ?? "";
        i += 1;
        break;
      case "--sub":
        opts.sub = argv[i + 1] ?? DEFAULT_SUBJECT;
        i += 1;
        break;
      case "--ttl":
        opts.ttl = Number(argv[i + 1] ?? DEFAULT_TTL_SECONDS);
        i += 1;
        break;
      case "--help":
      case "-h":
        usage();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return opts;
}

function base64urlEncode(value) {
  const input = typeof value === "string" ? value : JSON.stringify(value);
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function coerceOptionalString(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const secret = options.secret.trim();

  if (!secret) {
    throw new Error("Missing JWT secret. Export IDENTITY_JWT_SECRET or pass --secret <value>.");
  }

  if (secret.length < 32) {
    throw new Error("JWT secret is too short. Use at least 32 characters for HS256.");
  }

  const ttl = Number(options.ttl);
  if (!Number.isFinite(ttl) || ttl <= 0) {
    throw new Error(`Invalid TTL: ${options.ttl}. Provide a positive number of seconds.`);
  }

  const issuer = coerceOptionalString(options.issuer);
  const audience = coerceOptionalString(options.audience);
  const subject = coerceOptionalString(options.sub) ?? DEFAULT_SUBJECT;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const claims = {
    sub: subject,
    ...(issuer ? { iss: issuer } : {}),
    ...(audience ? { aud: audience } : {}),
    iat: now,
    exp: now + ttl,
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
  console.log(token);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`JWT generation failed: ${message}`);
  process.exit(1);
}
