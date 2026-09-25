//
// Portal‑OS Kernel Durable Object
// Window Manager + Portal Surface + OS State
//

import type { Env } from './contracts';
import {
  createEmptyWindowManagerState,
  WindowManagerState,
} from './windows';
import {
  createEmptyPortalSurfaceState,
  PortalSurfaceState,
} from './portal';
import {
  createEmptyPortalOsState,
  PortalOsState,
} from './state';
import { kernelError } from './errors';

export class PortalKernel {
  private windows: WindowManagerState;
  private portal: PortalSurfaceState;
  private os: PortalOsState;

  constructor(private readonly state: DurableObjectState, private readonly env: Env) {
    this.windows = createEmptyWindowManagerState();
    this.portal = createEmptyPortalSurfaceState();
    this.os = createEmptyPortalOsState(this.windows, this.portal, env.PORTAL_OS_VERSION, env.PORTAL_PLANETARY_MODE);
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (path === '/kernel/windows/state') {
        return this.json(this.windows);
      }

      if (path === '/kernel/portal/state') {
        return this.json(this.portal);
      }

      if (path === '/kernel/os/state') {
        this.os = {
          ...this.os,
          windows: this.windows,
          portal: this.portal,
        };
        return this.json(this.os);
      }

      return new Response(JSON.stringify(kernelError('Unknown kernel route', { path })), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify(kernelError('Kernel exception', { error: String(err) })), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
  }

  private json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
}
