//
// Identity Physics Layer
// MAX‑Institute + Portal‑OS Wing
//

import { IdentityEnvironment, PlanetaryIdentity } from "./types";

export function deriveIdentityEnvironment(
  identity: PlanetaryIdentity
): IdentityEnvironment {
  return {
    id: identity.id,
    signature: identity.signature,
  };
}

export function validateIdentitySignature(
  identity: PlanetaryIdentity
): boolean {
  return typeof identity.signature === "string" && identity.signature.length > 0;
}
