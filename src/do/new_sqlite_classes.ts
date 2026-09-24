export class new_sqlite_classes {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: unknown,
  ) {}

  async fetch(_request: Request): Promise<Response> {
    return new Response('SQLite DO OK');
  }
}
