import { Hono } from 'hono';
import type { Bindings } from './contracts';
import { beeSimEnvelope } from './planetary';
import { makeError } from './errors';
import { enforceUmbrella } from './umbrella-enforce';
import { identityEnvelope } from './identity';

/**
 * planetaryRouter
 *
 * Worker-side router for planetary / simulation surfaces.
 * Exposes /sim and leaves room for future planetary lanes.
 */
export function planetaryRouter(app: Hono<{ Bindings: Bindings }>) {
  /**
   * /sim
   *
   * Public planetary simulation surface.
   * Strict governance: identity + lane + planetary consistency.
   */
  app.get('/sim', async (c) => {
    const env = c.env;
    const token = c.req.header('authorization')?.replace('Bearer ', '');

    // Identity envelope
    const identity = await identityEnvelope(token, env);

    // Governance enforcement for planetary surface
    const gov = enforceUmbrella(env.UMBRELLA_ENFORCEMENT, {
      identityOk: identity.ok,
      rolesOk: identity.ok,          // placeholder until role routing exists
      permissionsOk: identity.ok,    // placeholder until permission maps exist
      laneOk: true,
      planetaryOk: true,
    });

    if (!gov.ok) {
      return c.json(makeError(gov.error!.code, gov.error!.message));
    }

    // Planetary / simulation envelope
    const envelope = beeSimEnvelope();
    return c.json(envelope);
  });

  return app;
}
