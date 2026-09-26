//
// Portal‑OS Worker Entry (v11 Kernel Substrate, API‑Corrected)
//

import { Hono } from "hono";
import { cors } from "hono/cors";

import type { Bindings, KernelEnvelope, KernelLane, JsonObject } from "./contracts";

import { identityEnvelope } from "./identity";
import { toUmbrellaErrorEnvelope } from "./umbrella-enforce";

import { toWindowsEnvelope } from "./windows";
import { toPortalEnvelope } from "./portal";
import { toPlanetaryEnvelope } from "./planetary";
import { toInstituteEnvelope, toCanonEnvelope, toTimelineEnvelope } from "./institute";
import { toSimEnvelope } from "./sim";
import { toInferenceEnvelope } from "./inference";

import { callKernel } from "./kernel-bridge";
import { roleAllows } from "./roles";
import { requirePermission } from "./permissions";

const app = new Hono<{ Bindings: Bindings }>();
const api = new Hono<{ Bindings: Bindings }>();

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
// API: Identity
// ------------------------------------------------------------
api.get("/identity", async (c) => {
  const token = bearer(c.req.header("Authorization"));
  const result = await identityEnvelope(token, c.env);
  return c.json(result);
});

// ------------------------------------------------------------
// API: Umbrella
// ------------------------------------------------------------
api.get("/umbrella", (c) => {
  const mode = c.env.UMBRELLA_ENFORCEMENT ?? "strict";
  return c.json({
    ok: true,
    mode,
    governance: toUmbrellaErrorEnvelope(null),
  });
});

// ------------------------------------------------------------
// API: Windows
// ------------------------------------------------------------
api.get("/windows", (c) => {
  return c.json(toWindowsEnvelope({ windows: {}, order: [] }));
});

// ------------------------------------------------------------
// API: Portal
// ------------------------------------------------------------
api.get("/portal", (c) => {
  return c.json(toPortalEnvelope({ panels: {}, order: [] }));
});

// ------------------------------------------------------------
// API: Planetary
// ------------------------------------------------------------
api.get("/planetary", (c) => {
  return c.json(
    toPlanetaryEnvelope({
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
    })
  );
});

// ------------------------------------------------------------
// API: Institute
// ------------------------------------------------------------
api.get("/institute/state", (c) => {
  return c.json(
    toInstituteEnvelope({
      canon: { signature: "EMPTY-CANON", truths: [] },
      timeline: { events: [] },
    })
  );
});

api.get("/institute/canon", (c) => {
  return c.json(toCanonEnvelope({ signature: "EMPTY-CANON", truths: [] }));
});

api.get("/institute/timeline", (c) => {
  return c.json(toTimelineEnvelope({ events: [] }));
});

// ------------------------------------------------------------
// API: SIM
// ------------------------------------------------------------
api.get("/sim", (c) => {
  return c.json(
    toSimEnvelope({
      tick: 0,
      agents: {},
      windows: {},
      substrate: {},
    })
  );
});

// ------------------------------------------------------------
// API: Inference
// ------------------------------------------------------------
api.get("/inference", async (c) => {
  const result = { ok: true, result: {} };
  return c.json(toInferenceEnvelope(result));
});

// ------------------------------------------------------------
// API: Portal interactive lanes (via Kernel)
// ------------------------------------------------------------
api.post("/portal/open", async (c) => portalAction(c, "portal:open"));
api.post("/portal/close", async (c) => portalAction(c, "portal:close"));
api.post("/portal/move", async (c) => portalAction(c, "portal:move"));
api.post("/portal/resize", async (c) => portalAction(c, "portal:resize"));
api.post("/portal/toggle", async (c) => portalAction(c, "portal:toggle"));

// ------------------------------------------------------------
// API: Portal timeline + diff + replay
// ------------------------------------------------------------
api.get("/portal/timeline", async (c) => {
  const stub = kernelStub(c.env);
  const res = await stub.fetch(
    new Request("https://portal/api/portal/timeline", {
      method: "POST",
      body: JSON.stringify({
        id: crypto.randomUUID(),
        lane: "portal:timeline",
        payload: {},
        identity: "introspection",
      }),
    })
  );
  return c.json(await res.json());
});

api.post("/portal/diff", async (c) => {
  const body = await c.req.json();

  const stub = kernelStub(c.env);
  const res = await stub.fetch(
    new Request("https://portal/api/portal/diff", {
      method: "POST",
      body: JSON.stringify({
        id: crypto.randomUUID(),
        lane: "portal:diff",
        payload: body,
        identity: "introspection",
      }),
    })
  );

  return c.json(await res.json());
});

api.post("/portal/replay", async (c) => {
  const body = await c.req.json();

  const stub = kernelStub(c.env);
  const res = await stub.fetch(
    new Request("https://portal/api/portal/replay", {
      method: "POST",
      body: JSON.stringify({
        id: crypto.randomUUID(),
        lane: "portal:replay",
        payload: body,
        identity: "introspection",
      }),
    })
  );

  return c.json(await res.json());
});

// ------------------------------------------------------------
// Mount API under /api
// ------------------------------------------------------------
app.route("/api", api);

// ------------------------------------------------------------
// Kernel bridge surfaces
// ------------------------------------------------------------
app.post("/kernel", async (c) => dispatchKernel(c));
app.post("/api/kernel/message", async (c) => dispatchKernel(c));

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
async function portalAction(c: any, perm: string): Promise<Response> {
  const token = bearer(c.req.header("Authorization"));
  const identity = await identityEnvelope(token, c.env);

  if (!identity.ok) {
    return error(401, "UNAUTHORIZED", "Invalid identity token");
  }

  const role = identity.identity.role ?? "anonymous";

  if (!roleAllows(role, "portal")) {
    return error(403, "ROLE_FORBIDDEN", `Role '${role}' cannot access portal lane`);
  }

  const check = requirePermission(identity, perm);
  if (!check.ok) return error(403, check.code, check.message);

  const body = await c.req.json();

  const envelope: KernelEnvelope = {
    id: typeof body.id === "string" ? body.id : crypto.randomUUID(),
    lane: "portal",
    payload: body,
    identity: identity.identity,
  };

  const res = await callKernel(c.env, envelope);
  return c.json(await res.json());
}

async function dispatchKernel(c: any): Promise<Response> {
  let body: JsonObject;

  try {
    body = await c.req.json();
  } catch {
    return error(400, "INVALID_JSON", "Request body must be JSON");
  }

  const lane = body.lane;

  if (!isLane(lane)) {
    return error(
      400,
      "INVALID_LANE",
      "lane must be identity, windows, sim, umbrella, or portal"
    );
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
  return (
    value === "identity" ||
    value === "windows" ||
    value === "sim" ||
    value === "umbrella" ||
    value === "portal"
  );
}

function bearer(value: string | undefined): string | undefined {
  return value?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
}

function error(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

function kernelStub(env: Bindings) {
  const id = env.PORTAL_KERNEL.idFromName("kernel");
  return env.PORTAL_KERNEL.get(id);
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

    if (url.pathname === "/kernel" || url.pathname.startsWith("/kernel/")) {
      const id = env.PORTAL_KERNEL.idFromName("kernel");
      const stub = env.PORTAL_KERNEL.get(id);
      return stub.fetch(request);
    }

    return app.fetch(request, env, ctx);
  },
};
