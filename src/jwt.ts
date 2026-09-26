//
// Portal‑OS JWT Substrate
// Cloudflare‑safe WebCrypto verification
//

import type { JsonObject } from "./contracts";
import { kernelError } from "./errors";

/**
 * verifyJwt
 *
 * Verifies a JWT using Cloudflare WebCrypto (HMAC SHA‑256).
 * Returns { ok: true, payload } or { ok: false, error }.
 */
export async function verifyJwt(
  token: string | undefined,
  secret: string
): Promise<{ ok: true; payload: JsonObject } | { ok: false; error: JsonObject }> {
  if (!token) {
    return {
      ok: false,
      error: kernelError("JWT_MISSING", { message: "No token provided" }),
    };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return {
      ok: false,
      error: kernelError("JWT_INVALID_FORMAT", {
        message: "Token must have header.payload.signature",
      }),
    };
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  let payloadJson: JsonObject;
  try {
    payloadJson = JSON.parse(atob(payloadB64));
  } catch {
    return {
      ok: false,
      error: kernelError("JWT_INVALID_PAYLOAD", {
        message: "Payload is not valid JSON",
      }),
    };
  }

  // Import HMAC key
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  // Verify signature
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToBytes(signatureB64);

  const valid = await crypto.subtle.verify("HMAC", key, signature, data);

  if (!valid) {
    return {
      ok: false,
      error: kernelError("JWT_INVALID_SIGNATURE", {
        message: "Signature verification failed",
      }),
    };
  }

  return {
    ok: true,
    payload: payloadJson,
  };
}

/**
 * base64UrlToBytes
 *
 * Converts base64url → Uint8Array.
 */
function base64UrlToBytes(b64url: string): Uint8Array {
  const padded = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
