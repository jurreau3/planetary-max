import type { PlanetaryIdentity } from "./types";

export function deriveIdentityEnvironment(identity: PlanetaryIdentity): { id: string; signature: string } {
  return {
    id: identity.id,
    signature: identity.signature,
  };
}

export function validateIdentitySignature(identity: PlanetaryIdentity): boolean {
  return typeof identity.signature === "string" && identity.signature.length > 0;
}

export default { deriveIdentityEnvironment, validateIdentitySignature };
