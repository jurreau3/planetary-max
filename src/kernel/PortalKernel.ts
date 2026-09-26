// src/kernel/PortalKernel.ts
// Portal‑OS v11 — Kernel with Identity Surfaces, Quantum, Advisory

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
  type PortalSurfaceState,
} from "../do/PortalSurface";

import {
  createEmptyPortalTimeline,
  addTimelineEvent,
  toPortalTimelineEnvelope,
  type PortalTimeline,
  type PortalTimelineEvent,
} from "../do/PortalTimeline";

import {
  computePortalDiff,
  toPortalDiffEnvelope,
} from "../do/PortalTimelineDiff";

import {
  loadQuantum,
  saveQuantum,
  addQuantumField,
  computeEntropy,
  toQuantumEnvelope,
} from "../do/PortalQuantum";

import {
  loadAdvisory,
  saveAdvisory,
  evaluateAdvisory,
  toAdvisoryEnvelope,
} from "../do/PortalAdvisory";

import {
  loadIdentitySurface,
  saveIdentitySurface,
  upsertIdentity,
  updateIdentityPresence,
  toIdentitySurfaceEnvelope,
} from "../do/PortalIdentitySurface";

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
      case "identity:surface":
        return this.handleIdentitySurface(identity, payload);
      case "windows":
        return this.handleWindows(id, identity, payload);
      case "sim":
        return this.handleSim(id, identity, payload);
      case "umbrella":
        return this.handleUmbrella(id, identity, payload);
      case "portal":
        return this.handlePortal(id, identity, payload);
      case "portal:timeline":
        return this.handlePortalTimeline();
      case "portal:diff":
        return this.handlePortalDiff(payload);
      case "portal:quantum":
        return this.handlePortalQuantum(identity, payload);
      case "portal:advisory":
        return this.handlePortalAdvisory();
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

  async loadSurface(): Promise<PortalSurfaceState> {
    return (
      (await this.state.storage.get("portal:surface")) ??
      createEmptyPortalSurfaceState()
    );
  }

  async saveSurface(surface: PortalSurfaceState) {
    await this.state.storage.put("portal:surface", surface);
  }

  async loadTimeline(): Promise<PortalTimeline> {
    return (
      (await this.state.storage.get("portal:timeline")) ??
      createEmptyPortalTimeline()
    );
  }

  async saveTimeline(timeline: PortalTimeline) {
    await this.state.storage.put("portal:timeline", timeline);
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

  async handleIdentitySurface(
    identity: string,
    payload: JsonObject
  ): Promise<Response> {
    let identitySurface = await loadIdentitySurface(this.state);

    const name = payload.name ?? identity ?? "anonymous";
    const role = (payload.role as any) ?? "user";

    identitySurface = upsertIdentity(identitySurface, identity, name, role);
    await saveIdentitySurface(this.state, identitySurface);

    return Response.json(toIdentitySurfaceEnvelope(identitySurface));
  }

  async handleWindows(
    id: string,
    identity: string,
    payload: JsonObject
  ): Promise<Response> {
    const action = payload.action ?? "noop";

    switch (action) {
      case "open":
      case "close":
        return Response.json({
          ok: true,
          lane: "windows",
          id,
          identity,
          action,
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

    let surface = await this.loadSurface();
    let timeline = await this.loadTimeline();
    let identitySurface = await loadIdentitySurface(this.state);

    const recordEvent = (panel: string | null) => {
      const event: PortalTimelineEvent = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        action,
        panel,
        payload: {
          ...payload,
          identity,
        },
      };
      timeline = addTimelineEvent(timeline, event);
      this.saveTimeline(timeline);
    };

    const updatePresence = (panelId: string | null) => {
      identitySurface = updateIdentityPresence(
        identitySurface,
        identity,
        panelId
      );
      this.state.storage.put("portal:identity-surface", identitySurface);
    };

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

        recordEvent(panel.id);
        updatePresence(panel.id);

        return Response.json({
          ok: true,
          lane: "portal",
          id,
          identity,
          action,
          panel,
          surface: toPortalEnvelope(surface),
          timeline: toPortalTimelineEnvelope(timeline),
          identitySurface: toIdentitySurfaceEnvelope(identitySurface),
        });
      }

      case "close": {
        surface = closePanel(surface, payload.panel);
        await this.saveSurface(surface);

        recordEvent(payload.panel);
        updatePresence(payload.panel);

        return Response.json({
          ok: true,
          lane: "portal",
          id,
          identity,
          action,
          panel: payload.panel,
          surface: toPortalEnvelope(surface),
          timeline: toPortalTimelineEnvelope(timeline),
          identitySurface: toIdentitySurfaceEnvelope(identitySurface),
        });
      }

      case "move": {
        surface = movePanel(surface, payload.panel, payload.x, payload.y);
        await this.saveSurface(surface);

        recordEvent(payload.panel);
        updatePresence(payload.panel);

        return Response.json({
          ok: true,
          lane: "portal",
          id,
          identity,
          action,
          panel: payload.panel,
          surface: toPortalEnvelope(surface),
          timeline: toPortalTimelineEnvelope(timeline),
          identitySurface: toIdentitySurfaceEnvelope(identitySurface),
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

        recordEvent(payload.panel);
        updatePresence(payload.panel);

        return Response.json({
          ok: true,
          lane: "portal",
          id,
          identity,
          action,
          panel: payload.panel,
          surface: toPortalEnvelope(surface),
          timeline: toPortalTimelineEnvelope(timeline),
          identitySurface: toIdentitySurfaceEnvelope(identitySurface),
        });
      }

      case "toggle": {
        surface = togglePanel(surface, payload.panel, payload.visible);
        await this.saveSurface(surface);

        recordEvent(payload.panel);
        updatePresence(payload.panel);

        return Response.json({
          ok: true,
          lane: "portal",
          id,
          identity,
          action,
          panel: payload.panel,
          surface: toPortalEnvelope(surface),
          timeline: toPortalTimelineEnvelope(timeline),
          identitySurface: toIdentitySurfaceEnvelope(identitySurface),
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

  async handlePortalTimeline(): Promise<Response> {
    const timeline = await this.loadTimeline();
    return Response.json(toPortalTimelineEnvelope(timeline));
  }

  async handlePortalDiff(payload: JsonObject): Promise<Response> {
    const fromId = payload.from;
    const toId = payload.to;

    const timeline = await this.loadTimeline();

    const eventFrom = timeline.events.find((e) => e.id === fromId);
    const eventTo = timeline.events.find((e) => e.id === toId);

    if (!eventFrom || !eventTo) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "PORTAL_DIFF_EVENT_NOT_FOUND",
            message: "One or both timeline events not found",
          },
        },
        { status: 404 }
      );
    }

    const surfaceBefore = await this.replaySurfaceUntil(fromId);
    const surfaceAfter = await this.replaySurfaceUntil(toId);

    const diff = computePortalDiff(
      surfaceBefore,
      surfaceAfter,
      eventFrom,
      eventTo
    );

    return Response.json(toPortalDiffEnvelope(diff));
  }

  async replaySurfaceUntil(eventId: string): Promise<PortalSurfaceState> {
    const timeline = await this.loadTimeline();
    let surface = createEmptyPortalSurfaceState();

    for (const event of timeline.events) {
      const { action, panel, payload } = event;

      switch (action) {
        case "open":
          surface = openPanel(surface, {
            id: panel!,
            title: payload.title ?? panel,
            x: payload.x ?? 100,
            y: payload.y ?? 100,
            width: payload.width ?? 300,
            height: payload.height ?? 200,
            visible: true,
          });
          break;

        case "close":
          surface = closePanel(surface, panel!);
          break;

        case "move":
          surface = movePanel(surface, panel!, payload.x, payload.y);
          break;

        case "resize":
          surface = resizePanel(
            surface,
            panel!,
            payload.width,
            payload.height
          );
          break;

        case "toggle":
          surface = togglePanel(surface, panel!, payload.visible);
          break;
      }

      if (event.id === eventId) break;
    }

    return surface;
  }

  async handlePortalQuantum(
    identity: string,
    payload: JsonObject
  ): Promise<Response> {
    let quantum = await loadQuantum(this.state);

    const field = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      entropy: computeEntropy(payload),
      lane: payload.lane ?? "portal",
      panel: payload.panel ?? null,
      payload: {
        ...payload,
        identity,
      },
    };

    quantum = addQuantumField(quantum, field);
    await saveQuantum(this.state, quantum);

    return Response.json(toQuantumEnvelope(quantum));
  }

  async handlePortalAdvisory(): Promise<Response> {
    let advisory = await loadAdvisory(this.state);
    const quantum = await loadQuantum(this.state);
    const timeline = await this.loadTimeline();

    const issues = evaluateAdvisory(quantum, timeline);

    advisory = {
      issues: [...advisory.issues, ...issues],
      lastCheck: Date.now(),
    };

    await saveAdvisory(this.state, advisory);

    return Response.json(toAdvisoryEnvelope(advisory));
  }
}
