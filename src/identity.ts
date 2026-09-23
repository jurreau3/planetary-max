export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" ? token : null;
}

export function decodeJwtPart(part: string): Record<string, unknown> {
  const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json);
}

export async function verifyIdentityJwt(
  token: string,
  env: {
    IDENTITY_JWT_SECRET: string;
    IDENTITY_JWT_ISSUER: string;
    IDENTITY_JWT_AUDIENCE: string;
  }
): Promise<boolean> {
  try {
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return false;

    const header = decodeJwtPart(h);
    const claims = decodeJwtPart(p);

    if (header.alg !== "HS256") return false;
    if (claims.iss !== env.IDENTITY_JWT_ISSUER) return false;
    if (claims.aud !== env.IDENTITY_JWT_AUDIENCE) return false;
    if (typeof claims.sub !== "string" || !claims.sub.trim()) return false;

    return true;
  } catch {
    return false;
  }
}
