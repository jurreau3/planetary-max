import crypto from "node:crypto";

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

function base64urlEncode(value) {
  return Buffer.from(value)
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

function readTokenFromInput() {
  if (process.argv[2]) {
    return process.argv[2];
  }

  const chunks = [];
  return new Promise((resolve, reject) => {
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(chunks.join("").trim()));
    process.stdin.on("error", (error) => reject(error));
  });
}

const secret = requireEnv("IDENTITY_JWT_SECRET");
const expectedIssuer = requireEnv("IDENTITY_JWT_ISSUER");
const expectedAudience = requireEnv("IDENTITY_JWT_AUDIENCE");
const expectedSubject = requireEnv("IDENTITY_JWT_SUBJECT");

const token = await readTokenFromInput();
if (!token || token.split(".").length !== 3) {
  fail("Token must be a JWT in the format header.payload.signature");
}

const [headerSegment, payloadSegment, signatureSegment] = token.split(".");
const headerJson = JSON.parse(base64urlDecode(headerSegment));
const payloadJson = JSON.parse(base64urlDecode(payloadSegment));

if (headerJson.alg !== "HS256") {
  fail(`Unexpected JWT alg: ${headerJson.alg}`);
}

const signingInput = `${headerSegment}.${payloadSegment}`;
const expectedSignature = crypto
  .createHmac("sha256", secret)
  .update(signingInput)
  .digest("base64")
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/g, "");

if (!crypto.timingSafeEqual(
  Buffer.from(expectedSignature),
  Buffer.from(signatureSegment),
)) {
  fail("JWT signature verification failed");
}

const nowSeconds = Math.floor(Date.now() / 1000);
if (typeof payloadJson.exp === "number" && payloadJson.exp <= nowSeconds) {
  fail("JWT is expired");
}

if (payloadJson.iss && payloadJson.iss !== expectedIssuer) {
  fail(`JWT issuer mismatch: expected ${expectedIssuer}, got ${payloadJson.iss}`);
}

if (payloadJson.aud && Array.isArray(payloadJson.aud)) {
  const audiences = payloadJson.aud;
  if (!audiences.includes(expectedAudience)) {
    fail(`JWT audience mismatch: expected ${expectedAudience} to be present`);
  }
} else if (payloadJson.aud && payloadJson.aud !== expectedAudience) {
  fail(`JWT audience mismatch: expected ${expectedAudience}, got ${payloadJson.aud}`);
}

if (payloadJson.sub && payloadJson.sub !== expectedSubject) {
  fail(`JWT subject mismatch: expected ${expectedSubject}, got ${payloadJson.sub}`);
}

console.log(
  JSON.stringify(
    {
      valid: true,
      alg: headerJson.alg,
      iss: payloadJson.iss,
      aud: payloadJson.aud,
      sub: payloadJson.sub,
      iat: payloadJson.iat,
      exp: payloadJson.exp,
    },
    null,
    2,
  ),
);
