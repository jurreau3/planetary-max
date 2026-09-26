//
// Portal‑OS Kernel Durable Object
// OS + Windows + Portal + Planetary + Institute + Inference + SIM
//

import type { Env, JsonObject } from "./contracts";

import {
  createEmptyPortalOsState,
  type PortalOsState,
  toOsEnvelope,
} from "./state";

import { toWindowsEnvelope, type WindowManagerState } from "./windows";
import { toPortalEnvelope, type PortalSurfaceState } from "./portal";

import {
  toPlanetaryEnvelope,
  type PlanetaryState,
} from "./planetary";

import {
  createEmptyInstituteState,
  type InstituteState,
  toInstituteEnvelope,
  toCanonEnvelope,
  toTimelineEnvelope,
} from "./institute";

import {
  createEmptySimState,
  type SimSubstrateState,
  toSimEnvelope,
} from "./sim";

import {
  runInference,
  type InferenceInput,
  type InferenceResult,
  toInferenceEnvelope,
} from "./inference";

export class PortalKernel {
  private os: PortalOsState;
  private windows: WindowManagerState;
  private portal: PortalSurfaceState;
  private planetary: PlanetaryState;
  private institute: InstituteState;
  private sim: SimSubstrateState;

  constructor(private state: DurableObjectState, private env: Env) {
    this.windows = {} as WindowManagerState;
    this.portal = {} as PortalSurfaceState;
    this.planetary = {
      globalTick: 0,
      nodes: [],
      identities: {},
      substrate: {},
      quantum: {},
      canon: {},
      governance: {},
      advisories: [],
      synchronizedAt: Date.now(),
      packetSignature: "EMPTY-PACKET",
    };
    this.institute = createEmptyInstituteState();
    this.sim = createEmptySimState();
    this.os = createEmptyPortalOsState(
      this.windows,
      this.portal,
      env.VERSION,
      env.PORTAL_MODE,
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    switch (path) {
      //
      // OS
      //
      case "/kernel/os/state": {
        return this.json(toOsEnvelope(this.os));
      }

      //
      // Windows
      //
      case "/kernel/windows/state": {
        return this.json(toWindowsEnvelope(this.windows));
      }

      //
      // Portal
      //
      case "/kernel/portal/state": {
        return this.json(toPortalEnvelope(this.portal));
      }

      //
      // Planetary
      //
      case "/kernel/planetary/state": {
        return this.json(toPlanetaryEnvelope(this.planetary));
      }

      //
      // Institute
      //
      case "/kernel/institute/state": {
        return this.json(toInstituteEnvelope(this.institute));
      }

      case "/kernel/institute/canon": {
        return this.json(toCanonEnvelope(this.institute.canon));
      }

      case "/kernel/institute/timeline": {
        return this.json(toTimelineEnvelope(this.institute.timeline));
      }

      //
      // SIM
      //
      case "/kernel/sim/state": {
        return this.json(toSimEnvelope(this.sim));
      }

      //
      // Inference
      //
      case "/kernel/inference/state": {
        const input: InferenceInput = {
          context: {},
          substrate: this.os as unknown as JsonObject,
          quantum: this.planetary.quantum,
          institute: this.institute as unknown as JsonObject,
          planetary: this.planetary as unknown as JsonObject,
        };

        const result: InferenceResult = await runInference(input);
        return this.json(toInferenceEnvelope(result));
      }

      //
      // Default
      //
      default: {
        return this.json(
          {
            ok: false,
            service: "PORTAL-KERNEL",
            error: {
              code: "KERNEL_ROUTE_NOT_FOUND",
              message: "Unknown kernel route",
              details: { path },
            },
          },
          404,
        );
      }
    }
  }

  private json(body: JsonObject, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json",
      },
    });
  }
}
