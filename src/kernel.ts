//
// Portal‑OS Kernel Router
// Governance → Identity → Kernel DO Dispatch → Introspection
//

import { Hono } from "hono";
import type { Bindings } from "./contracts";

import { kernelError } from "./errors";
import { identityEnvelope } from "./identity";
import { enforceUmbrella, toUmbrellaErrorEnvelope } from "./umbrella-enforce";

import { toWindowsEnvelope } from "./windows";
import { toPortalEnvelope } from "./portal";
import { toOsEnvelope } from "./state";

export function kernelRouter(app: Hono<{ Bindings: Bindings }>) {
  //
  // /kernel/:lane
  // Main entry point into the Portal‑OS Kernel Durable Object.
  //
  app.post("/kernel/:lane", async (c) => {
    const lane = c.req.param("lane");
    const env = c.env;

    const token = c.req.header("authorization")?.replace("Bearer ", "");
    const identity = await identityEnvelope(token, env);

    const gov = enforceUmbrella(env.UMBRELLA_ENFORCEMENT, {
      identityOk: identity.ok,
      rolesOk: identity.ok,
      permissionsOk: identity.ok,
      laneOk: Boolean(lane),
      planetaryOk: true,
    });

    if (!gov.ok) {
      return c.json(toUmbrellaErrorEnvelope(gov.error!), 403);
    }

    try {
      const id = env.PORTAL_KERNEL.idFromName("PORTAL-KERNEL");
      const stub = env.PORTAL_KERNEL.get(id);

      const result = await stub.fetch(c.req.raw);
      return result;
    } catch (err) {
      return c.json(
        kernelError("Kernel dispatch failed", { error: String(err) }),
        500,
      );
    }
  });

  //
  // /introspection/windows/state
  //
  app.get("/introspection/windows/state", async (c) => {
    try {
      const id = c.env.PORTAL_KERNEL.idFromName("PORTAL-KERNEL");
      const stub = c.env.PORTAL_KERNEL.get(id);

      const res = await stub.fetch("https://kernel.internal/kernel/windows/state");
      const json = await res.json();

      return c.json(toWindowsEnvelope(json));
    } catch (err) {
      return c.json(
        kernelError("Kernel windows introspection failed", { error: String(err) }),
        500,
      );
    }
  });

  //
  // /introspection/portal/state
  //
  app.get("/introspection/portal/state", async (c) => {
    try {
      const id = c.env.PORTAL_KERNEL.idFromName("PORTAL-KERNEL");
      const stub = c.env.PORTAL_KERNEL.get(id);

      const res = await stub.fetch("https://kernel.internal/kernel/portal/state");
      const json = await res.json();

      return c.json(toPortalEnvelope(json));
    } catch (err) {
      return c.json(
        kernelError("Kernel portal introspection failed", { error: String(err) }),
        500,
      );
    }
  });

  //
  // /introspection/os
  //
  app.get("/introspection/os", async (c) => {
    try {
      const id = c.env.PORTAL_KERNEL.idFromName("PORTAL-KERNEL");
      const stub = c.env.PORTAL_KERNEL.get(id);

      const res = await stub.fetch("https://kernel.internal/kernel/os/state");
      const json = await res.json();

      return c.json(toOsEnvelope(json));
    } catch (err) {
      return c.json(
        kernelError("Kernel OS introspection failed", { error: String(err) }),
        500,
      );
    }
  });

  //
  // Fallback
  //
  app.all("*", (c) => {
    return c.json(
      kernelError("Unknown kernel router route", { path: c.req.path }),
      404,
    );
  });

  return app;
}
