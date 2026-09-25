// FILE: src/index.contract.test.ts
import { describe, it, expect } from "vitest";
import app from "./index";

function run(path: string, init?: RequestInit) {
  return app.request(path, init);
}

describe("Portal‑OS JSON Contract", () => {

  // -----------------------------
  // 1. Kernel Status
  // -----------------------------
  it("GET /api/kernel/status → correct JSON shape", async () => {
    const res = await run("/api/kernel/status");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveProperty("status");
    expect(json).toHaveProperty("tick");
    expect(json).toHaveProperty("signals");
    expect(json).toHaveProperty("kernelMode");
  });

  // -----------------------------
  // 2. MAXOS_STATE
  // -----------------------------
  it("GET /api/state/read → correct JSON shape", async () => {
    const res = await run("/api/state/read");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveProperty("state");
    expect(json.state).toHaveProperty("identity");
    expect(json.state).toHaveProperty("runtime");
    expect(json.state).toHaveProperty("planetary");
    expect(json.state).toHaveProperty("phase");
  });

  // -----------------------------
  // 3. Umbrella Enforcement
  // -----------------------------
  it("GET /api/umbrella/status → correct JSON shape", async () => {
    const res = await run("/api/umbrella/status");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveProperty("rules");
    expect(Array.isArray(json.rules)).toBe(true);
    expect(json).toHaveProperty("active");
    expect(json).toHaveProperty("lastUpdate");
  });

  // -----------------------------
  // 4. Phase‑11
  // -----------------------------
  it("GET /api/phase/status → correct JSON shape", async () => {
    const res = await run("/api/phase/status");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveProperty("phase");
    expect(json).toHaveProperty("coherence");
    expect(json).toHaveProperty("signals");
  });

  // -----------------------------
  // 5. Planetary Mode
  // -----------------------------
  it("GET /api/planetary/mode → correct JSON shape", async () => {
    const res = await run("/api/planetary/mode");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveProperty("mode");
    expect(typeof json.mode).toBe("string");
  });

  // -----------------------------
  // 6. Planetary Toggle
  // -----------------------------
  it("POST /api/planetary/toggle → correct JSON shape", async () => {
    const res = await run("/api/planetary/toggle", { method: "POST" });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveProperty("mode");
    expect(typeof json.mode).toBe("string");
  });

  // -----------------------------
  // 7. MaxOS Version
  // -----------------------------
  it("GET /api/version/read → correct JSON shape", async () => {
    const res = await run("/api/version/read");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveProperty("version");
    expect(json).toHaveProperty("build");
    expect(json).toHaveProperty("commit");
  });

  // -----------------------------
  // 8. CORS + Preflight
  // -----------------------------
  it("OPTIONS /api/kernel/status → CORS preflight", async () => {
    const res = await run("/api/kernel/status", { method: "OPTIONS" });
    expect(res.status).toBe(200);

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("OPTIONS");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
  });

});
