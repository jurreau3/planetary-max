/**
 * Portal-OS Introspection Routes
 * 
 * Adds authenticated, governance-aware introspection endpoints
 * that query real kernel state through the PORTAL_KERNEL Durable Object.
 * 
 * All routes require:
 * - Bearer JWT authentication (HS256, issuer="portal-login", audience="planetary-max")
 * - Umbrella strict governance enforcement
 * - Valid identity and governance context
 */

import { Hono, Context } from 'hono';
import {
  KernelEnvelope,
  KernelResult,
  Bindings,
  createEnvelope,
} from './index';

export type IntrospectionKind =
  | 'sim.behavior'
  | 'identity.timeline'
  | 'windows.focus'
  | 'umbrella.enforcement'
  | 'kernel.heatmap'
  | 'tec.pipeline'
  | 'substrate.state'
  | 'messages'
  | 'logs'
  | 'inference';

export interface IntrospectionRequest {
  kind: IntrospectionKind;
  filters?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

export interface IntrospectionMeta {
  kind: IntrospectionKind;
  timestamp: number;
  source: 'kernel';
  governance: 'strict' | 'advisory' | 'off';
  identity: {
    subject: string;
    propagated: boolean;
  };
}

export interface IntrospectionResponse {
  ok: boolean;
  data: Record<string, unknown>;
  meta: IntrospectionMeta;
  error?: { code: string; message: string };
}

/**
 * Create introspection routes for the Hono app.
 * Should be mounted on the main app instance before export.
 */
export function attachIntrospectionRoutes(
  app: Hono<{ Bindings: Bindings }>,
): void {
  // GET /api/introspection/sim/behavior
  // Returns SIM behavior timeline, agent states, reasoning trace
  app.get('/api/introspection/sim/behavior', async (c) =>
    introspectionRoute(c, 'sim.behavior', {}),
  );

  // GET /api/introspection/identity/timeline
  // Returns identity mode transitions, token refresh events, session history
  app.get('/api/introspection/identity/timeline', async (c) =>
    introspectionRoute(c, 'identity.timeline', {}),
  );

  // GET /api/introspection/windows/focus
  // Returns window focus transitions, z-index lineage, activation order
  app.get('/api/introspection/windows/focus', async (c) =>
    introspectionRoute(c, 'windows.focus', {}),
  );

  // GET /api/introspection/umbrella/enforcement
  // Returns governance rule evaluation log, hit/miss trace, enforcement chain
  app.get('/api/introspection/umbrella/enforcement', async (c) =>
    introspectionRoute(c, 'umbrella.enforcement', {}),
  );

  // GET /api/introspection/kernel/heatmap
  // Returns kernel pressure metrics, spawn/kill clusters, normalized load
  app.get('/api/introspection/kernel/heatmap', async (c) =>
    introspectionRoute(c, 'kernel.heatmap', {}),
  );

  // GET /api/introspection/tec/pipeline
  // Returns TEC pipeline stage timings, agent dispatch log, rollback history
  app.get('/api/introspection/tec/pipeline', async (c) =>
    introspectionRoute(c, 'tec.pipeline', {}),
  );

  // GET /api/introspection/substrate/state
  // Returns DO + KV state snapshot, coherence status, last transaction
  app.get('/api/introspection/substrate/state', async (c) =>
    introspectionRoute(c, 'substrate.state', {}),
  );

  // GET /api/introspection/messages
  // Returns recent message queue state, async envelope status, backlog
  app.get('/api/introspection/messages', async (c) =>
    introspectionRoute(c, 'messages', {}),
  );

  // GET /api/introspection/logs
  // Returns structured log entries, context propagation, error traces
  app.get('/api/introspection/logs', async (c) =>
    introspectionRoute(c, 'logs', {}),
  );

  // GET /api/introspection/inference
  // Returns inference cache state, confidence scores, reasoning trails
  app.get('/api/introspection/inference', async (c) =>
    introspectionRoute(c, 'inference', {}),
  );
}

/**
 * Core introspection handler: route a query through the kernel,
 * preserving JWT identity, governance enforcement, and Umbrella strict mode.
 */
async function introspectionRoute(
  c: Context<{ Bindings: Bindings }>,
  kind: IntrospectionKind,
  filters: Record<string, unknown>,
): Promise<Response> {
  // Import these from index.ts to avoid circular imports
  const {
    authenticatedIdentity,
    callKernel,
    readKernelResult,
    resultResponse,
    failureResponse,
  } = await import('./index');

  // 1. Authenticate
  const identity = await authenticatedIdentity(c.req.header('Authorization'), c.env);
  if (identity instanceof Response) return identity;

  // 2. Create governance context for introspection
  const governanceContext = {
    surface: 'introspection',
    kind,
  };

  // 3. Build kernel envelope: type will be "introspection.<kind>"
  const envelope = createEnvelope(
    `introspection.${kind}`,
    filters,
    identity,
    governanceContext,
    c.env.UMBRELLA_ENFORCEMENT,
  );

  // 4. Call kernel
  try {
    const response = await callKernel(c.env, envelope);
    const result = await readKernelResult(response, envelope, 'PortalKernel');

    // 5. Transform result into IntrospectionResponse
    if (!result.ok) {
      return resultResponse(result, response.status);
    }

    const introspectionResponse: IntrospectionResponse = {
      ok: true,
      data: result.data,
      meta: {
        kind,
        timestamp: Date.now(),
        source: 'kernel',
        governance: result.meta.governance.mode,
        identity: {
          subject: extractSubjectFromIdentity(identity),
          propagated: result.meta.identity.propagated,
        },
      },
    };

    return c.json(introspectionResponse, 200);
  } catch (error) {
    console.error(`[INTROSPECTION] ${kind} failed`, error instanceof Error ? error.message : String(error));
    return failureResponse(
      'INTROSPECTION_FAILED',
      `Introspection query for ${kind} failed`,
      500,
    );
  }
}

/**
 * Extract subject (sub claim) from JWT token string.
 * Falls back to 'unknown' if parsing fails.
 */
function extractSubjectFromIdentity(identity: string): string {
  try {
    const parts = identity.split('.');
    if (parts.length !== 3) return 'unknown';
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.sub === 'string' ? payload.sub : 'unknown';
  } catch {
    return 'unknown';
  }
}
