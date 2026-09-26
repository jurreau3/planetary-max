//
// Portal‑OS Worker Entry
// Unified Hono router + Kernel bridge + Identity + Umbrella + Windows + Portal
//

import { Hono } from "hono";
import { cors } from "hono/cors";

import type { Bindings, KernelEnvelope, KernelLane, JsonObject } from "./contracts";

import { identityEnvelope } from "./identity";
import { verifyJwt } from "./jwt";

import { enforceUmbrella, toUmbrellaErrorEnvelope } from "./umbrella-enforce";

import { toWindowsEnvelope } from "./windows";
import { toPortalEnvelope } from "./portal";
import { toPlanetaryEnvelope } from "./planetary";
import { toInstituteEnvelope, toCanonEnvelope, toTimelineEnvelope } from "./institute";
import { toSimEnvelope } from "./sim";
import { toInferenceEnvelope } from "./inference";

import { callKernel } from "./kernel-bridge";
import { roleAllows } from "./roles";
import { requirePermission } from "./permissions";

// ------------------------------------------------------------
// App + Router
// ------------------------------------------------------------
const app = new Hono<{ Bindings: Bindings }>();
const router = new Hono<{ Bindings: Bindings }>();

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// ------------------------------------------------------------
// Root + health
// ------------------------------------------------------------
app.get("/", (c) => {
  return c.json({
    ok: true,
    service: "portal-os",
    phase: c.env.PORTAL_OS_PHASE ?? "11",
  });
});

app.get("/health", (c) => c.json({ ok: true, service: "portal-os" }));

// ------------------------------------------------------------
// Identity
// ------------------------------------------------------------
app.get("/identity", async (c) => {
  const token = bearer(c.req.header("Authorization"));
  const result = await identityEnvelope(token, c.env);

  return c.json(result);
});

// ------------------------------------------------------------
// Umbrella governance
// ------------------------------------------------------------
app.get("/umbrella", (c) => {
  const mode = c.env.UMBRELLA_ENFORCEMENT ?? "strict";
  return c.json({
    ok: true,
    mode,
    governance: toUmbrellaErrorEnvelope(null),
  });
});

// ------------------------------------------------------------
// Windows (introspection only)
// ------------------------------------------------------------
app.get("/windows", (c) => {
  return c.json(toWindowsEnvelope({ windows: {}, order: [] }));
});

// ------------------------------------------------------------
// Portal surface (introspection only)
// ------------------------------------------------------------
app.get("/portal", (c) => {
  return c.json(toPortalEnvelope({ panels: {}, order: [] }));
});

// ------------------------------------------------------------
// Planetary substrate (introspection only)
// ------------------------------------------------------------
app.get("/planetary", (c) => {
  return c.json(toPlanetaryEnvelope({
    globalTick: 0,
    nodes: [],
    identities: {},
    substrate: {},
    quantum: {},
    canon: {},
    governance: {},
    advisories: [],
    synchronizedAt: Date.now(),
    packetSignature: "EMPTY",
  }));
});

// ------------------------------------------------------------
// Institute substrate (introspection only)
// ------------------------------------------------------------
app.get("/institute/state", (c) => {
  return c.json(toInstituteEnvelope({
    canon: { signature: "EMPTY-CANON", truths: [] },
    timeline: { events: [] },
  }));
});

app.get("/institute/canon", (c) => {
  return c.json(toCanonEnvelope({ signature: "EMPTY-CANON", truths: [] }));
});

app.get("/institute/timeline", (c) => {
  return c.json(toTimelineEnvelope({ events: [] }));
});

// ------------------------------------------------------------
// SIM substrate (introspection only)
// ------------------------------------------------------------
app.get("/sim", (c) => {
  return c.json(toSimEnvelope({
    tick: 0,
    agents: {},
    windows: {},
    substrate: {},
  }));
});

// ------------------------------------------------------------
// Inference substrate (introspection only)
// ------------------------------------------------------------
app.get("/inference", (c) => {
  return c.json(toInferenceEnvelope({
    ok: true,
    result: {},
  }));
});

// ------------------------------------------------------------
// Kernel bridge surfaces
// ------------------------------------------------------------
app.post("/kernel", async (c) => dispatchKernel(c));
app.post("/api/kernel/message", async (c) => dispatchKernel(c));

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
async function dispatchKernel(c: any): Promise<Response> {
  let body: JsonObject;

  try {
    body = await c.req.json();
  } catch {
    return error(400, "INVALID_JSON", "Request body must be JSON");
  }

  const lane = body.lane;

  if (!isLane(lane)) {
    return error(400, "INVALID_LANE", "lane must be identity, windows, sim, or umbrella");
  }

  const token = bearer(c.req.header("Authorization"));
  const identity = await identityEnvelope(token, c.env);

  if (!identity.ok) {
    return error(401, "UNAUTHORIZED", "Invalid identity token");
  }

  const role = identity.identity.role ?? "anonymous";

  if (!roleAllows(role, lane)) {
    return error(403, "ROLE_FORBIDDEN", `Role '${role}' cannot access lane '${lane}'`);
  }

  const permCheck = requirePermission(identity, `${lane}:write`);
  if (!permCheck.ok) {
    return error(403, permCheck.code, permCheck.message);
  }

  const envelope: KernelEnvelope = {
    id: typeof body.id === "string" ? body.id : crypto.randomUUID(),
    lane,
    payload: body,
    identity: identity.identity,
  };

  try {
    return await callKernel(c.env, envelope);
  } catch {
    return error(503, "KERNEL_UNAVAILABLE", "PortalKernel is unavailable");
  }
}

function isLane(value: unknown): value is KernelLane {
  return value === "identity" || value === "windows" || value === "sim" || value === "umbrella";
}

function bearer(value: string | undefined): string | undefined {
  return value?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
}

function error(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

// ------------------------------------------------------------
// Durable Object exports
// ------------------------------------------------------------
export * from "./do";

// ------------------------------------------------------------
// FINAL — Worker fetch
// ------------------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/kernel")) {
      const id = env.PORTAL_KERNEL.idFromName("kernel");
      const stub = env.PORTAL_KERNEL.get(id);
      return stub.fetch(request);
    }

    return app.fetch(request, env, ctx);
  },
};
