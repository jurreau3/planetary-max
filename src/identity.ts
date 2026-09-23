import type { IdentityEnvironment } from "./types";

type JwtClaims = Readonly<Record<string, unknown>>;

export function bearerToken(header: string | undefined): string | null {
  const match: RegExpExecArray | null = /^Bearer ([^\s]+)$/.exec(header ?? "");
  return match?.[1] ?? null;
}

export async function authenticatedIdentity(
  authorization: string | undefined,
  env: IdentityEnvironment,
): Promise<string | Response> {
  const token: string | null = bearerToken(authorization);
  if (token === null) {
    return identityFailure("UNAUTHENTICATED", "Bearer token required", 401);
  }
  if (!env.IDENTITY_JWT_SECRET) {
    return identityFailure("IDENTITY_UNAVAILABLE", "Identity verification is not configured", 503);
  }

  const subject: string | null = await verifyIdentityJwt(token, env);
  if (subject === null) {
    return identityFailure("UNAUTHENTICATED", "Invalid bearer token", 401);
  }
  return subject;
}

export async function verifyIdentityJwt(
  token: string,
  env: IdentityEnvironment,
): Promise<string | null> {
  try {
    const parts: string[] = token.split(".");
    if (parts.length !== 3) return null;

    const encodedHeader: string | undefined = parts[0];
    const encodedClaims: string | undefined = parts[1];
    const encodedSignature: string | undefined = parts[2];
    if (!encodedHeader || !encodedClaims || !encodedSignature) return null;

    const header: JwtClaims = decodeJwtPart(encodedHeader);
    const claims: JwtClaims = decodeJwtPart(encodedClaims);
    if (header.alg !== "HS256") return null;
    if (typeof claims.sub !== "string" || !claims.sub.trim()) return null;

    const now: number = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== "number" || claims.exp <= now) return null;
    if (typeof claims.nbf === "number" && claims.nbf > now) return null;
    if (claims.iss !== env.IDENTITY_JWT_ISSUER) return null;
    if (!jwtAudienceIncludes(claims.aud, env.IDENTITY_JWT_AUDIENCE)) {
      return null;
    }

    const key: CryptoKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.IDENTITY_JWT_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid: boolean = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`),
    );
    return valid ? claims.sub : null;
  } catch {
    return null;
  }
}

function decodeJwtPart(value: string): JwtClaims {
  const decoded: unknown = JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
  if (!isRecord(decoded)) throw new Error("JWT part must be an object");
  return decoded;
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64: string = value.replace(/-/g, "+").replace(/_/g, "/");
  const decoded: string = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let index: number = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function jwtAudienceIncludes(value: unknown, expected: string): boolean {
  return value === expected || (Array.isArray(value) && value.some((entry: unknown): boolean => entry === expected));
}

function identityFailure(code: string, message: string, status: number): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
