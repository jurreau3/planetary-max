// src/index.ts
// Portal‑OS v11 — Worker Entry

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Bindings } from "./contracts";

const app = new Hono<{ Bindings: Bindings }>();
const api = new Hono<{ Bindings: Bindings }>();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.get("/", (c) =>
  c.json({
    ok: true,
    service: "portal-os",
    phase: c.env.PORTAL_OS_PHASE ?? "11",
  })
);

app.get("/health", (c) => c.json({ ok: true }));

api.get("/portal/timeline", async (c) => {
  const stub = kernelStub(c.env);
  const res = await stub.fetch(
    new Request("https://portal/kernel", {
      method: "POST",
      body: JSON.stringify({
        id: crypto.randomUUID(),
        lane: "portal:timeline",
        payload: {},
      }),
    })
  );
  return c.json(await res.json());
});

api.post("/portal/diff", async (c) => {
  const body = await c.req.json();
  const stub = kernelStub(c.env);
  const res = await stub.fetch(
    new Request("https://portal/kernel", {
      method: "POST",
      body: JSON.stringify({
        id: crypto.randomUUID(),
        lane: "portal:diff",
        payload: body,
      }),
    })
  );
  return c.json(await res.json());
});

api.post("/portal/quantum", async (c) => {
  const body = await c.req.json();
  const stub = kernelStub(c.env);
  const res = await stub.fetch(
    new Request("https://portal/kernel", {
      method: "POST",
      body: JSON.stringify({
        id: crypto.randomUUID(),
        lane: "portal:quantum",
        payload: body,
      }),
    })
  );
  return c.json(await res.json());
});

api.get("/portal/advisory", async (c) => {
  const stub = kernelStub(c.env);
  const res = await stub.fetch(
    new Request("https://portal/kernel", {
      method: "POST",
      body: JSON.stringify({
        id: crypto.randomUUID(),
        lane: "portal:advisory",
        payload: {},
      }),
    })
  );
  return c.json(await res.json());
});

api.post("/portal/identity-surface", async (c) => {
  const body = await c.req.json();
  const identity = body.identity ?? "anonymous";

  const stub = kernelStub(c.env);
  const res = await stub.fetch(
    new Request("https://portal/kernel", {
      method: "POST",
      body: JSON.stringify({
        id: crypto.randomUUID(),
        lane: "identity:surface",
        identity,
        payload: body,
      }),
    })
  );

  return c.json(await res.json());
});

app.route("/api", api);

function kernelStub(env: Bindings) {
  const id = env.PORTAL_KERNEL.idFromName("kernel");
  return env.PORTAL_KERNEL.get(id);
}
api.get("/portal/scheduler", async (c) => {
  const stub = kernelStub(c.env);
  const res = await stub.fetch(
    new Request("https://portal/kernel", {
      method: "POST",
      body: JSON.stringify({
        id: crypto.randomUUID(),
        lane: "portal:scheduler",
        payload: {},
      }),
    })
  );
  return c.json(await res.json());
});


export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/kernel") {
      const stub = kernelStub(env);
      return stub.fetch(request);
    }

    return app.fetch(request, env, ctx);
  },
};
