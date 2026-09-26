import type { DurableObjectState } from "@cloudflare/workers-types";
import type { Bindings, KernelEnvelope, JsonObject } from "../contracts";

import {
  createEmptyPortalSurfaceState,
  openPanel,
  closePanel,
  movePanel,
  resizePanel,
  togglePanel,
  toPortalEnvelope,
} from "./PortalSurface";

export class PortalKernel {
  state: DurableObjectState;
  env: Bindings;

  constructor(state: DurableObjectState, env: Bindings) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return Response.json(
        {
          ok: false,
          error: {
            code: "INVALID_METHOD",
            message: "Kernel only accepts POST envelopes",
          },
        },
        { status: 405 }
      );
    }

    let envelope: KernelEnvelope;
    try {
      envelope = await request.json();
    } catch {
      return Response.json(
        {
          ok: false,
          error: {
            code: "INVALID_ENVELOPE",
            message: "Kernel envelope must be valid JSON",
          },
        },
        { status: 400 }
      );
    }

    const { id, lane, payload, identity } = envelope;

    switch (lane) {
      case "identity":
        return this.handleIdentity(id, identity, payload);
      case "windows":
        return this.handleWindows(id, identity, payload);
      case "sim":
        return this.handleSim(id, identity, payload);
      case "umbrella":
        return this.handleUmbrella(id, identity, payload);
      case "portal":
        return this.handlePortal(id, identity, payload);
      default:
        return Response.json(
          {
            ok: false,
            error: {
              code: "INVALID_LANE",
              message: `Unknown kernel lane: ${lane}`,
            },
          },
          { status: 400 }
        );
    }
  }

  // ------------------------------------------------------------
  // Identity lane
  // ------------------------------------------------------------
  async handleIdentity(
    id: string,
    identity: string,
    payload: JsonObject
  ): Promise<Response> {
    return Response.json({
      ok: true,
      lane: "identity",
      id,
      identity,
      echo: payload,
    });
  }

  // ------------------------------------------------------------
  // Windows lane
  // ------------------------------------------------------------
  async handleWindows(
    id: string,
    identity: string,
    payload: JsonObject
  ): Promise<Response> {
    const action = payload.action ?? "noop";

    switch (action) {
      case "open":
        return Response.json({
          ok: true,
          lane: "windows",
          id,
          identity,
          action: "open",
          window: payload.window ?? null,
        });

      case "close":
        return Response.json({
          ok: true,
          lane: "windows",
          id,
          identity,
          action: "close",
          window: payload.window ?? null,
        });

      default:
        return Response.json(
          {
            ok: false,
            error: {
              code: "WINDOWS_INVALID_ACTION",
              message: `Unknown windows action: ${action}`,
            },
          },
          { status: 400 }
        );
    }
  }

  // ------------------------------------------------------------
  // SIM lane
  // ------------------------------------------------------------
  async handleSim(
    id: string,
    identity: string,
    payload: JsonObject
  ): Promise<Response> {
    return Response.json({
      ok: true,
      lane: "sim",
      id,
      identity,
      sim: {
        mode: this.env.PLANETARY_MODE ?? "single",
        echo: payload,
      },
    });
  }

  // ------------------------------------------------------------
  // Umbrella lane
  // ------------------------------------------------------------
  async handleUmbrella(
    id: string,
    identity: string,
    payload: JsonObject
  ): Promise<Response> {
    const mode = this.env.UMBRELLA_ENFORCEMENT ?? "strict";

    return Response.json({
      ok: true,
      lane: "umbrella",
      id,
      identity,
      governance: {
        mode,
        echo: payload,
      },
    });
  }

  // ------------------------------------------------------------
  // Portal Surface State Helpers
  // ------------------------------------------------------------
  async loadSurface() {
    return (
      (await this.state.storage.get("portal:surface")) ??
      createEmptyPortalSurfaceState()
    );
  }

  async saveSurface(surface: any) {
    await this.state.storage.put("portal:surface", surface);
  }

  // ------------------------------------------------------------
  // Portal lane (interactive)
  // ------------------------------------------------------------
  async handlePortal(
    id: string,
    identity: string,
    payload: JsonObject
  ): Promise<Response> {
    const action = payload.action ?? "noop";
    let surface = await this.loadSurface();

    switch (action) {
      case "open": {
        const panel = {
          id: payload.panel,
          title: payload.title ?? payload.panel,
          x: payload.x ?? 100,
          y: payload.y ?? 100,
          width: payload.width ?? 300,
          height: payload.height ?? 200,
          visible: true,
        };

        surface = openPanel(surface, panel);
        await this.saveSurface(surface);

        return Response.json({
          ok: true,
          lane: "portal",
          id,
          identity,
          action: "open",
          panel,
          surface: toPortalEnvelope(surface),
        });
      }

      case "close": {
        surface = closePanel(surface, payload.panel);
        await this.saveSurface(surface);

        return Response.json({
          ok: true,
          lane: "portal",
          id,
          identity,
          action: "close",
          panel: payload.panel,
          surface: toPortalEnvelope(surface),
        });
      }

      case "move": {
        surface = movePanel(surface, payload.panel, payload.x, payload.y);
        await this.saveSurface(surface);

        return Response.json({
          ok: true,
          lane: "portal",
          id,
          identity,
          action: "move",
          panel: payload.panel,
          surface: toPortalEnvelope(surface),
        });
      }

      case "resize": {
        surface = resizePanel(
          surface,
          payload.panel,
          payload.width,
          payload.height
        );
        await this.saveSurface(surface);

        return Response.json({
          ok: true,
          lane: "portal",
          id,
          identity,
          action: "resize",
          panel: payload.panel,
          surface: toPortalEnvelope(surface),
        });
      }

      case "toggle": {
        surface = togglePanel(surface, payload.panel, payload.visible);
        await this.saveSurface(surface);

        return Response.json({
          ok: true,
          lane: "portal",
          id,
          identity,
          action: "toggle",
          panel: payload.panel,
          surface: toPortalEnvelope(surface),
        });
      }

      default:
        return Response.json(
          {
            ok: false,
            error: {
              code: "PORTAL_INVALID_ACTION",
              message: `Unknown portal action: ${action}`,
            },
          },
          { status: 400 }
        );
    }
  }
}
