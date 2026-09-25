export class PortalKernel {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    return new Response("PortalKernel OK");
  }
}
