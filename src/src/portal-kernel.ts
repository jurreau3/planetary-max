export class PortalKernel {
  state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const body = await request.json().catch(() => null);

    return Response.json({
      ok: true,
      result: { echo: body },
      meta: { kernel: "PortalKernel" },
    });
  }
}
