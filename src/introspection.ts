//
// Portal‑OS Unified Introspection Router
// OS + Windows + Portal + Planetary + Institute + Inference + SIM
//

import { Hono } from "hono";
import type { Bindings } from "./contracts";

import { identityEnvelope } from "./identity";
import { enforceUmbrella, toUmbrellaErrorEnvelope } from "./umbrella-enforce";

import { kernelError } from "./errors";

import { toOsEnvelope } from "./state";
import { toWindowsEnvelope } from "./windows";
import { toPortalEnvelope } from "./portal";

import { toPlanetaryEnvelope } from "./planetary";
import {
  toInstituteEnvelope,
  toCanonEnvelope,
  toTimelineEnvelope,
} from "./institute";

import { toInferenceEnvelope } from "./inference";
import { toSimEnvelope } from "./sim";

export function introspectionRouter(app: Hono<{ Bindings: Bindings }>) {
  //
  // Governance wrapper
  //
  async function checkGov(c: any) {
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
      return { ok: false, res: c.json(toUmbrellaErrorEnvelope(gov.error!), 403) };
    }

    return { ok: true };
  }

  //
  // Helper: fetch from kernel DO
  //
  async function kernelFetch(c: any, path: string) {
    try {
      const id = c.env.PORTAL_KERNEL.idFromName("PORTAL-KERNEL");
      const stub = c.env.PORTAL_KERNEL.get(id);

      const res = await stub.fetch(`https://kernel.internal${path}`);
      return await res.json();
    } catch (err) {
      return { __error: String(err) };
    }
  }

  //
  // OS
  //
  app.get("/introspection/os", async (c) => {
    const gov = await checkGov(c);
    if (!gov.ok) return gov.res;

    const json = await kernelFetch(c, "/kernel/os/state");
    if (json.__error) {
      return c.json(kernelError("OS introspection failed", { error: json.__error }), 500);
    }

    return c.json(toOsEnvelope(json));
  });

  //
  // Windows
  //
  app.get("/introspection/windows/state", async (c) => {
    const gov = await checkGov(c);
    if (!gov.ok) return gov.res;

    const json = await kernelFetch(c, "/kernel/windows/state");
    if (json.__error) {
      return c.json(kernelError("Windows introspection failed", { error: json.__error }), 500);
    }

    return c.json(toWindowsEnvelope(json));
  });

  //
  // Portal
  //
  app.get("/introspection/portal/state", async (c) => {
    const gov = await checkGov(c);
    if (!gov.ok) return gov.res;

    const json = await kernelFetch(c, "/kernel/portal/state");
    if (json.__error) {
      return c.json(kernelError("Portal introspection failed", { error: json.__error }), 500);
    }

    return c.json(toPortalEnvelope(json));
  });

  //
  // Planetary
  //
  app.get("/introspection/planetary/state", async (c) => {
    const gov = await checkGov(c);
    if (!gov.ok) return gov.res;

    const json = await kernelFetch(c, "/kernel/planetary/state");
    if (json.__error) {
      return c.json(kernelError("Planetary introspection failed", { error: json.__error }), 500);
    }

    return c.json(toPlanetaryEnvelope(json));
  });

  //
  // Institute (full)
  //
  app.get("/introspection/institute/state", async (c) => {
    const gov = await checkGov(c);
    if (!gov.ok) return gov.res;

    const json = await kernelFetch(c, "/kernel/institute/state");
    if (json.__error) {
      return c.json(kernelError("Institute introspection failed", { error: json.__error }), 500);
    }

    return c.json(toInstituteEnvelope(json));
  });

  //
  // Institute (canon)
  //
  app.get("/introspection/institute/canon", async (c) => {
    const gov = await checkGov(c);
    if (!gov.ok) return gov.res;

    const json = await kernelFetch(c, "/kernel/institute/canon");
    if (json.__error) {
      return c.json(kernelError("Institute canon introspection failed", { error: json.__error }), 500);
    }

    return c.json(toCanonEnvelope(json));
  });

  //
  // Institute (timeline)
  //
  app.get("/introspection/institute/timeline", async (c) => {
    const gov = await checkGov(c);
    if (!gov.ok) return gov.res;

    const json = await kernelFetch(c, "/kernel/institute/timeline");
    if (json.__error) {
      return c.json(kernelError("Institute timeline introspection failed", { error: json.__error }), 500);
    }

    return c.json(toTimelineEnvelope(json));
  });

  //
  // Inference
  //
  app.get("/introspection/inference", async (c) => {
    const gov = await checkGov(c);
    if (!gov.ok) return gov.res;

    const json = await kernelFetch(c, "/kernel/inference/state");
    if (json.__error) {
      return c.json(kernelError("Inference introspection failed", { error: json.__error }), 500);
    }

    return c.json(toInferenceEnvelope(json));
  });

  //
  // Simulation
  //
  app.get("/introspection/sim/state", async (c) => {
    const gov = await checkGov(c);
    if (!gov.ok) return gov.res;

    const json = await kernelFetch(c, "/kernel/sim/state");
    if (json.__error) {
      return c.json(kernelError("SIM introspection failed", { error: json.__error }), 500);
    }

    return c.json(toSimEnvelope(json));
  });

  //
  // Fallback
  //
  app.all("*", (c) => {
    return c.json(
      kernelError("Unknown introspection route", { path: c.req.path }),
      404
    );
  });

  return app;
}
