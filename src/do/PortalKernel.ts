export class PortalKernel {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    let envelope;

    try {
      envelope = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: "INVALID_JSON" }),
        { status: 400 }
      );
    }

    const { id, lane, payload, identity } = envelope;

    if (!["identity", "windows", "sim", "umbrella"].includes(lane)) {
      return new Response(
        JSON.stringify({ ok: false, error: "INVALID_LANE" }),
        { status: 400 }
      );
    }

    // Load kernel state
    const kernelState = (await this.state.storage.get("kernel")) || {
      windows: {},
      portal: {},
      timeline: [],
      identity: {},
      umbrella: {},
    };

    let result;

    switch (lane) {
      case "identity":
        result = { identity: identity || "anonymous" };
        break;

      case "windows":
        result = { windows: kernelState.windows };
        break;

      case "sim":
        result = { sim: "ready" };
        break;

      case "umbrella":
        result = { umbrella: kernelState.umbrella };
        break;
    }

    // Update timeline
    kernelState.timeline.push({
      id,
      lane,
      ts: Date.now(),
      payload,
    });

    await this.state.storage.put("kernel", kernelState);

    return new Response(
      JSON.stringify({
        ok: true,
        kernel: "PortalKernel",
        id,
        lane,
        result,
      }),
      { status: 200 }
    );
  }
}


