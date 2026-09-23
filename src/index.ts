import type { Context } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { evaluateGovernance, resolveUmbrellaMode } from "./governance";
import { authenticatedIdentity } from "./identity";
import { attachIntrospectionRoutes } from "./introspection";
import {
  callKernel,
  createEnvelope,
  failureResponse,
  governanceFailureResult,
  isRecord,
  readJsonObject,
  readKernelResult,
  resultResponse,
} from "./kernel-bridge";
import type {
  Bindings,
  GovernanceMetadata,
  KernelEnvelope,
  KernelResult,
} from "./types";

const MAX_OS_BRIDGE_URL = "https://max-os-1.invalid/kernel/message";

const UMBRELLA_OPERATIONS: Readonly<Record<string, string>> = Object.freeze({
  "/umbrella/identity/license": "identity.physics.license",
  "/umbrella/governance/license": "governance.engine.license",
  "/umbrella/apex/advisory": "apex.alignment.advisory",
  "/umbrella/sim/pack": "umbrella.sim.pack",
  "/umbrella/market/forecast": "umbrella.market.forecast",
  "/umbrella/identity/mirror": "umbrella.identity.mirror",
  "/umbrella/crossworld/access": "umbrella.crossworld.access",
  "/umbrella/structural/truth/license": "structural.truth.license",
});

export const app: Hono<{ Bindings: Bindings }> = new Hono<{ Bindings: Bindings }>();

app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

app.get("/", (context: Context<{ Bindings: Bindings }>): Response =>
  context.json({
    status: "Portal-OS live",
    worker: "planetary-max",
    mode: context.env.PLANETARY_MODE ?? "single",
    umbrella: resolveUmbrellaMode(context.env.UMBRELLA_ENFORCEMENT),
  }),
);

app.get("/health", (context: Context<{ Bindings: Bindings }>): Response =>
  context.json({
    status: "ok",
    service: "planetary-max",
    umbrella: resolveUmbrellaMode(context.env.UMBRELLA_ENFORCEMENT),
  }),
);

app.post("/api/kernel/message", async (context: Context<{ Bindings: Bindings }>): Promise<Response> => {
  const value: KernelEnvelope | Response = await parseEnvelope(
    context.req.raw,
    context.req.header("Authorization"),
    context.env,
  );
  return value instanceof Response ? value : kernelResponse(context.env, value);
});

app.get("/api/autonomy", (context: Context<{ Bindings: Bindings }>): Promise<Response> =>
  routeKernelMessage(context.env, context.req.header("Authorization"), "autonomy.state", {}),
);
app.get("/universe/state", (context: Context<{ Bindings: Bindings }>): Promise<Response> =>
  routeKernelMessage(context.env, context.req.header("Authorization"), "universe.state", {}),
);
app.get("/universe/umbrella", (context: Context<{ Bindings: Bindings }>): Promise<Response> =>
  routeKernelMessage(context.env, context.req.header("Authorization"), "universe.umbrella", {}),
);

for (const [path, type] of Object.entries(UMBRELLA_OPERATIONS)) {
  app.post(path, async (context: Context<{ Bindings: Bindings }>): Promise<Response> => {
    const value: ParsedPayload | Response = await parsePayload(
      context.req.raw,
      context.req.header("Authorization"),
      context.env,
    );
    if (value instanceof Response) return value;
    return kernelResponse(
      context.env,
      createEnvelope(
        type,
        value.payload,
        value.identity,
        value.governanceContext,
        context.env.UMBRELLA_ENFORCEMENT,
      ),
    );
  });
}

app.post("/universe/tick", async (context: Context<{ Bindings: Bindings }>): Promise<Response> => {
  const value: ParsedPayload | Response = await parsePayload(
    context.req.raw,
    context.req.header("Authorization"),
    context.env,
    true,
  );
  if (value instanceof Response) return value;
  return kernelResponse(
    context.env,
    createEnvelope(
      "universe.tick",
      value.payload,
      value.identity,
      value.governanceContext,
      context.env.UMBRELLA_ENFORCEMENT,
    ),
  );
});

app.post("/os/kernel/message", async (context: Context<{ Bindings: Bindings }>): Promise<Response> => {
  const parsed: KernelEnvelope | Response = await parseEnvelope(
    context.req.raw,
    context.req.header("Authorization"),
    context.env,
  );
  if (parsed instanceof Response) return parsed;

  const governance: GovernanceMetadata = evaluateGovernance(
    parsed,
    context.env.UMBRELLA_ENFORCEMENT,
  );
  if (governance.decision === "denied") {
    return resultResponse(governanceFailureResult(parsed, governance), 403);
  }

  try {
    const response: Response = await context.env.MAX_OS_1.fetch(
      new Request(MAX_OS_BRIDGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      }),
    );
    return resultResponse(
      await readKernelResult(response, parsed, "MAX-OS-1"),
      response.status,
    );
  } catch {
    return failureResponse("MAX_OS_UNAVAILABLE", "MAX-OS-1 bridge unavailable", 503);
  }
});

attachIntrospectionRoutes(app);

type ParsedPayload = Readonly<{
  identity: string;
  payload: Record<string, unknown>;
  governanceContext: Record<string, unknown>;
}>;

async function routeKernelMessage(
  env: Bindings,
  authorization: string | undefined,
  type: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const identity: string | Response = await authenticatedIdentity(authorization, env);
  if (identity instanceof Response) return identity;
  return kernelResponse(
    env,
    createEnvelope(type, payload, identity, {}, env.UMBRELLA_ENFORCEMENT),
  );
}

async function parseEnvelope(
  request: Request,
  authorization: string | undefined,
  env: Bindings,
): Promise<KernelEnvelope | Response> {
  const identity: string | Response = await authenticatedIdentity(authorization, env);
  if (identity instanceof Response) return identity;

  const body: Record<string, unknown> | Response = await readJsonObject(
    request,
    "Kernel envelope must be a JSON object",
  );
  if (body instanceof Response) return body;
  if (typeof body.type !== "string" || !body.type.trim()) {
    return failureResponse("INVALID_MESSAGE", "Kernel message type is required", 400);
  }
  if (!isRecord(body.payload)) {
    return failureResponse("INVALID_MESSAGE", "Kernel message payload must be an object", 400);
  }
  if (body.governanceContext !== undefined && !isRecord(body.governanceContext)) {
    return failureResponse(
      "INVALID_MESSAGE",
      "Kernel governanceContext must be an object",
      400,
    );
  }
  return createEnvelope(
    body.type,
    body.payload,
    identity,
    isRecord(body.governanceContext) ? body.governanceContext : {},
    env.UMBRELLA_ENFORCEMENT,
  );
}

async function parsePayload(
  request: Request,
  authorization: string | undefined,
  env: Bindings,
  optionalBody: boolean = false,
): Promise<ParsedPayload | Response> {
  const identity: string | Response = await authenticatedIdentity(authorization, env);
  if (identity instanceof Response) return identity;
  if (optionalBody && request.body === null) {
    return { identity, payload: {}, governanceContext: {} };
  }
  const body: Record<string, unknown> | Response = await readJsonObject(
    request,
    "Request body must be a JSON object",
  );
  if (body instanceof Response) return body;
  return { identity, payload: body, governanceContext: {} };
}

async function kernelResponse(env: Bindings, envelope: KernelEnvelope): Promise<Response> {
  try {
    const response: Response = await callKernel(env, envelope);
    const result: KernelResult = await readKernelResult(response, envelope, "PortalKernel");
    return resultResponse(result, response.status);
  } catch {
    return failureResponse("KERNEL_UNAVAILABLE", "PortalKernel bridge unavailable", 503);
  }
}

export { createEnvelope, extractLaneData, readKernelResult } from "./kernel-bridge";
export { resolveUmbrellaMode } from "./governance";
export {
  formInstituteTruth,
  initialInstituteState,
  isInstituteFormationFailure,
  MIN_INSTITUTE_PATTERN_TICKS,
  MIN_INSTITUTE_STABILITY,
  parseTruthFormation,
} from "./institute";
export { PortalKernel } from "./portal-kernel";
export type {
  Bindings,
  EpistemicEvent,
  EpistemicEventAction,
  EpistemicTimeline,
  InstituteCanon,
  InstituteInferenceFact,
  InstituteQuantumBranch,
  InstituteSimulationDelta,
  InstituteState,
  InstituteTruth,
  InstituteTruthFormation,
  KernelEnvelope,
  KernelLane,
  KernelResult,
  PortalKernelState,
  SimAgentState,
  SimEvent,
  SimEventType,
  SimSubstrateState,
  SimTickDiff,
  SimWindowState,
} from "./types";

export default {
  async fetch(request: Request, env: Bindings, context: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, context);
  },
};
