import { jwtVerify } from 'jose/webcrypto';

export async function verifyIdentityJwt(
  token: string,
  env: {
    IDENTITY_JWT_ISSUER: string;
    IDENTITY_JWT_AUDIENCE: string;
    IDENTITY_JWT_SECRET: string;
  },
) {
  const secret = new TextEncoder().encode(env.IDENTITY_JWT_SECRET);

  const { payload } = await jwtVerify(token, secret, {
    issuer: env.IDENTITY_JWT_ISSUER,
    audience: env.IDENTITY_JWT_AUDIENCE,
  });

  return payload; // { sub, email, roles, ... }
}
