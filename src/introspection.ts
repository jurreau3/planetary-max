import { Hono } from "hono";

export type IntrospectionKind =
  | "sim.behavior"
  | "identity.timeline"
  | "windows.focus"
  | "windows.state"
  | "windows.timeline"
  | "umbrella.enforcement"
  | "kernel.heatmap"
  | "tec.pipeline"
  | "substrate.state"
  | "messages"
  | "logs"
  | "inference";

const ROUTES: Array<[string, IntrospectionKind]> = [
  ["/api/introspection/sim/behavior", "sim.behavior"],
  ["/api/introspection/identity/timeline", "identity.timeline"],
  ["/api/introspection/windows/focus", "windows.focus"],
  ["/api/introspection/windows/state", "windows.state"],
  ["/api/introspection/windows/timeline", "windows.timeline"],
  ["/api/introspection/umbrella/enforcement", "umbrella.enforcement"],
  ["/api/introspection/kernel/heatmap", "kernel.heatmap"],
  ["/api/introspection/tec/pipeline", "tec.pipeline"],
  ["/api/introspection/substrate/state", "substrate.state"],
  ["/api/introspection/messages", "messages"],
  ["/api/introspection/logs", "logs"],
  ["/api/introspection/inference", "inference"],
];

export function attachIntrospectionRoutes(app: Hono) {
  for (const [path, kind] of ROUTES) {
    app.get(path, (c) =>
      c.json({
        ok: true,
        introspection: kind,
        worker: "planetary-max",
      })
    );
  }
}
