import type { DurableObjectState } from "@cloudflare/workers-types";
import type { Bindings, KernelEnvelope, JsonObject } from "../contracts";

export class PortalKernel {
  state: DurableObjectState;
  env: Bindings;

  constructor(state: DurableObjectState, env: Bindings) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

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

  async handlePortal(
    id: string,
    identity: string,
    payload: JsonObject
  ): Promise<Response> {
    const action = payload.action ?? "noop";

    switch (action) {
      case "open":
        return Response.json({
          ok: true,
          lane: "portal",
          id,
          identity,
          action: "open",
          panel: payload.panel ?? null,
        });

      case "close":
        return Response.json({
          ok: true,
          lane: "portal",
          id,
          identity,
          action: "close",
          panel: payload.panel ?? null,
        });

      case "move":
        return Response.json({
          ok: true,
          lane: "portal",
          id,
          identity,
          action: "move",
          panel: payload.panel ?? null,
        });

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
