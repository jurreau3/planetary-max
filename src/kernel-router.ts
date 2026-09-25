import { Hono } from 'hono';
import type { Bindings } from './contracts';
import { makeError } from './errors';
import { identityEnvelope } from './identity';
import { enforceUmbrella } from './umbrella-enforce';
import { toWindowsEnvelope } from './windows';
import { toPortalEnvelope } from './portal';
import { toPortalOsEnvelope } from './state';

export function kernelRouter(app: Hono<{ Bindings: Bindings }>) {
  /**
   * /kernel/:lane
   *
   * Main entry point into the Portal‑OS Kernel Durable Object.
   * All governance checks happen here before dispatch.
   */
  app.post('/kernel/:lane', async (c) => {
    const lane = c.req.param('lane');
    const token = c.req.header('authorization')?.replace('Bearer ', '');
    const env = c.env;

    // Identity envelope
    const identity = await identityEnvelope(token, env);

    // Governance enforcement
    const gov = enforceUmbrella(env.UMBRELLA_ENFORCEMENT, {
      identityOk: identity.ok,
      rolesOk: identity.ok, // placeholder until role routing is added
      permissionsOk: identity.ok, // placeholder until permission maps exist
      laneOk: Boolean(lane),
      planetaryOk: true,
    });

    if (!gov.ok) {
      return c.json(makeError(gov.error!.code, gov.error!.message));
    }

    // Dispatch to kernel DO
    const id = env.PORTAL_KERNEL.idFromName('kernel');
    const stub = env.PORTAL_KERNEL.get(id);

    const result = await stub.fetch(c.req.raw);
    return result;
  });

  /**
   * /introspection/windows/state
   *
   * Returns the window manager state from the kernel.
   */
  app.get('/introspection/windows/state', async (c) => {
    const env = c.env;
    const id = env.PORTAL_KERNEL.idFromName('kernel');
    const stub = env.PORTAL_KERNEL.get(id);

    const res = await stub.fetch('https://kernel/windows/state');
    const json = await res.json();

    return c.json(toWindowsEnvelope(json));
  });

  /**
   * /introspection/portal/state
   *
   * Returns the portal surface state from the kernel.
   */
  app.get('/introspection/portal/state', async (c) => {
    const env = c.env;
    const id = env.PORTAL_KERNEL.idFromName('kernel');
    const stub = env.PORTAL_KERNEL.get(id);

    const res = await stub.fetch('https://kernel/portal/state');
    const json = await res.json();

    return c.json(toPortalEnvelope(json));
  });

  /**
   * /introspection/os
   *
   * Returns the full OS state from the kernel.
   */
  app.get('/introspection/os', async (c) => {
    const env = c.env;
    const id = env.PORTAL_KERNEL.idFromName('kernel');
    const stub = env.PORTAL_KERNEL.get(id);

    const res = await stub.fetch('https://kernel/os/state');
    const json = await res.json();

    return c.json(toPortalOsEnvelope(json));
  });

  return app;
}
