import { enforceUmbrella } from './umbrella-enforce';

async function dispatchRequest(c) {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return error(400, 'INVALID_JSON', 'Request body must be JSON');
  }

  const payload = asJsonObject(body);
  const lane = payload.lane;

  if (!isLane(lane)) {
    return error(400, 'INVALID_LANE', 'lane must be identity, windows, sim, or umbrella');
  }

  const rawBearer = bearer(c.req.header('Authorization'));

  // Umbrella enforcement
  const auth = await enforceUmbrella(rawBearer, c.env, lane);
  if (!auth.ok) {
    return error(403, auth.code, auth.message);
  }

  const envelope: KernelEnvelope = {
    id: typeof payload.id === 'string' ? payload.id : crypto.randomUUID(),
    lane,
    payload,
    identity: auth.identity,
  };

  try {
    return await callKernel(c.env, envelope);
  } catch {
    return error(503, 'KERNEL_UNAVAILABLE', 'PortalKernel is unavailable');
  }
}
