export class PortalKernel {
  state: DurableObjectState;
  env: Bindings;

  constructor(state: DurableObjectState, env: Bindings) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Kernel only accepts POST envelopes
    if (request.method !== 'POST') {
      return Response.json(
        {
          ok: false,
          error: {
            code: 'INVALID_METHOD',
            message: 'Kernel only accepts POST envelopes',
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
            code: 'INVALID_ENVELOPE',
            message: 'Kernel envelope must be valid JSON',
          },
        },
        { status: 400 }
      );
    }

    const { id, lane, payload, identity } = envelope;

    // Kernel routing
    switch (lane) {
      case 'identity':
        return this.handleIdentity(id, identity, payload);

      case 'windows':
        return this.handleWindows(id, identity, payload);

      case 'sim':
        return this.handleSim(id, identity, payload);

      case 'umbrella':
        return this.handleUmbrella(id, identity, payload);

      default:
        return Response.json(
          {
            ok: false,
            error: {
              code: 'INVALID_LANE',
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
      lane: 'identity',
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
    const action = payload.action ?? 'noop';

    switch (action) {
      case 'open':
        return Response.json({
          ok: true,
          lane: 'windows',
          id,
          identity,
          action: 'open',
          window: payload.window ?? null,
        });

      case 'close':
        return Response.json({
          ok: true,
          lane: 'windows',
          id,
          identity,
          action: 'close',
          window: payload.window ?? null,
        });

      default:
        return Response.json(
          {
            ok: false,
            error: {
              code: 'WINDOWS_INVALID
