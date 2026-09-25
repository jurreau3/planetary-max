export class new_sqlite_classes {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    return new Response("new_sqlite_classes OK");
  }
}



