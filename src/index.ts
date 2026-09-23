+ import { Hono } from "hono";
+ import { Bindings } from "./types";
+ import {
+   authenticatedIdentity,
+   createEnvelope,
+   failureResponse,
+   failureResult,
+   isRecord,
+   KernelEnvelope,
+   readJsonObject,
+   readKernelResult,
+   resultResponse,
+ } from "./kernel-bridge";

+ const app = new Hono<{ Bindings: Bindings }>();

+ const KERNEL_OBJECT_NAME = "portal-kernel";
+ const KERNEL_BRIDGE_URL =
+   "https://portal-kernel.invalid/api/kernel/message";
+ const MAX_OS_BRIDGE_URL =
+   "https://max-os-1.invalid/kernel/message";

+ app.get("/", (c) =>
+   c.json({
+     status: "Portal-OS live",
+     worker: "planetary-max",
+     mode: c.env.PLANETARY_MODE,
+     umbrella: c.env.UMBRELLA_ENFORCEMENT,
+   })
+ );

+ async function parseEnvelope(
+   request: Request,
+   authorization: string | undefined,
+   env: Bindings
+ ): Promise<KernelEnvelope | Response> {
+   const identity = await authenticatedIdentity(authorization, env);
+   if (identity instanceof Response) return identity;

+   const body = await readJsonObject(
+     request,
+     "Kernel envelope must be JSON"
+   );
+   if (body instanceof Response) return body;

+   if (typeof body.type !== "string" || !body.type.trim()) {
+     return failureResponse(
+       "INVALID_MESSAGE",
+       "Kernel message type is required",
+       400
+     );
+   }

+   if (!isRecord(body.payload)) {
+     return failureResponse(
+       "INVALID_MESSAGE",
+       "Kernel message payload must be an object",
+       400
+     );
+   }

+   if (
+     body.governanceContext !== undefined &&
+     !isRecord(body.governanceContext)
+   ) {
+     return failureResponse(
+       "INVALID_MESSAGE",
+       "Kernel governanceContext must be an object",
+       400
+     );
+   }

+   return createEnvelope(
+     body.type,
+     body.payload,
+     identity,
+     isRecord(body.governanceContext)
+       ? body.governanceContext
+       : {},
+     env.UMBRELLA_ENFORCEMENT
+   );
+ }

+ app.post("/os/kernel/message", async (c) => {
+   const parsed = await parseEnvelope(
+     c.req.raw,
+     c.req.header("authorization"),
+     c.env
+   );
+   if (parsed instanceof Response) return parsed;

+   const response = await c.env.MAX_OS_1.fetch(
+     new Request(MAX_OS_BRIDGE_URL, {
+       method: "POST",
+       headers: { "content-type": "application/json" },
+       body: JSON.stringify(parsed),
+     })
+   );

+   return resultResponse(
+     await readKernelResult(response, parsed, "MAX-OS-1"),
+     response.status
+   );
+ });

+ export default {
+   fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
+     return app.fetch(request, env, ctx);
+   },
+ };
