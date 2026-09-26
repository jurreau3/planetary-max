//
// Portal‑OS Planetary Router
// Hono router for planetary introspection + simulation envelopes
//

import { Hono } from "hono";
import type { Bindings } from "./contracts";

import { kernelError, planetaryError } from "./errors";
import { identityEnvelope } from "./identity";
import { enforceUmbrella, toUmbrellaErrorEnvelope } from "./umbrella-enforce";
import { toPlanetaryEnvelope, beeSimEnvelope } from "./planetary";

export function planetaryRouter(app: Hono<{ Bindings: Bindings }>) {
  //
  // /introspection/planetary/state
  // Planetary‑MAX substrate introspection via kernel DO.
  //
  app.get("/introspection/planetary/state", async (c) => {
    const env = c.env;

    const token = c.req.header("authorization")?.replace("Bearer ", "");
    const identity = await identityEnvelope(token, env);

    const gov = enforceUmbrella(env.UMBRELLA_ENFORCEMENT, {
      identityOk: identity.ok,
      rolesOk: identity.ok,
      permissionsOk: identity.ok,
      laneOk: true,
      planetaryOk: true,
    });

    if (!gov.ok) {
      return c.json(toUmbrellaErrorEnvelope(gov.error!), 403);
    }

    try {
      const id = env.PORTAL_KERNEL.idFromName("PORTAL-KERNEL");
      const stub = env.PORTAL_KERNEL.get(id);

      const res = await stub.fetch("https://kernel.internal/kernel/planetary/state");
      const json = await res.json();

      return c.json(toPlanetaryEnvelope(json));
    } catch (err) {
      return c.json(
        planetaryError("Planetary state introspection failed", { error: String(err) }),
        500,
      );
    }
  });

  //
  // /sim
  // Public planetary simulation envelope.
  //
  app.get("/sim", (c) => {
    return c.json(beeSimEnvelope());
  });

  //
  // Fallback
  //
  app.all("*", (c) => {
    return c.json(
      kernelError("Unknown planetary router route", { path: c.req.path }),
      404,
    );
  });

  return app;
}
