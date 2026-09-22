# Portal-OS — Rebuild 2

**Integrated Operating System Architecture**

> Rebuild 1 proved the system works.  
> Rebuild 2 makes the system whole.

Portal-OS is a distributed operating system built on Cloudflare Workers, with a kernel written in Python and a cognitive architecture built on SIM (Symbolic Intelligent Model).

## Structure

```
src/
  ├── index.ts                    # Cloudflare Workers entrypoint (Hono)
kernel/
  ├── boot.py                     # Kernel initialization
  ├── scheduler.py                # Multi-domain scheduler
  ├── invariants.py               # System invariants
  └── [modules]/                  # Kernel subsystems
identity/                          # Identity & authentication
governance/                        # Rules & policies
routing/                           # Message routing
orchestration/                    # Task orchestration
tec/                              # TEC execution layer
cognitive/                        # SIM cognitive architecture
```

## Rebuild 2 — What It Is

Rebuild 2 is the **integration rebuild** — the phase where Portal-OS transforms from a set of working components into a **unified, internally coherent operating system**.

### Purpose

Transform Rebuild 1's successful deploy state into a fully integrated Portal-OS architecture where every subsystem is wired together into a single deterministic runtime.

### Key Additions

1. **Worker → Kernel Bridge** — Message bridge between Worker entrypoint and Kernel boot
2. **Kernel Initialization Sequence** — Formalizes invariants, module loading, scheduler startup, governance + identity registration
3. **Multi-Domain Scheduler** — Cognitive, orchestration, substrate, and governance lanes
4. **SIM Cognitive Wiring** — Kernel → SIM integration (Core, State, Trajectory, Compute)
5. **TEC Execution Layer** — Pipelines, agents, surfaces, governance hooks
6. **Identity + Governance Enforcement** — Wired into routing, orchestration, kernel invariants
7. **Routing Table** — Deterministic routing from Worker → Kernel → SIM → TEC → Substrate → Worker
8. **Substrate State Model** — Durable Object state with KV-backed `MAXOS_STATE` configuration

## Rebuild 2 — Build Order

1. ✓ Worker → Kernel bridge
2. ✓ Kernel boot + invariants
3. ✓ Scheduler domain lanes
4. ✓ SIM wiring
5. ✓ TEC pipelines
6. ✓ Identity + governance
7. ✓ Routing table
8. ✓ Substrate state model
9. ✓ MAX-OS-1 universe adapter
10. ✓ Full integration test

## System Invariants

Portal-OS maintains these invariants across all layers:

### Tier 1: Foundational
- **State Coherence** — System state must be consistent across all layers
- **No Silent Failures** — Every failure must be logged and escalated

### Tier 2: Security
- **Authorization Enforced** — Every operation must be authorized
- **Identity Established** — Every message must carry valid identity

### Tier 3: Messaging
- **Message Ordering** — Intra-domain ordering is strict
- **No Message Loss** — Every message is processed or explicitly rejected
- **Message Timeout** — Messages have bounded age

### Tier 4: Concurrency
- **Scheduler Cycles Complete** — Cycles complete within bounded time
- **No Deadlock** — Lanes never deadlock each other

### Tier 5: Substrate
- **Substrate Consistent** — Durable Object + KV state synchronized
- **KV Eventual Consistency** — System handles eventual consistency gracefully

### Tier 6: Execution
- **SIM Trajectory Valid** — SIM state trajectory is always valid
- **TEC Execution Bounded** — TEC agents complete within bounded time

## Getting Started

### Prerequisites
- Python 3.9+
- Node.js 18+
- Cloudflare Workers account

### Running Kernel Boot
```bash
python kernel/boot.py
```

This will execute the full boot sequence:
1. Load invariants
2. Load modules
3. Start scheduler
4. Register governance
5. Register identity

### Worker and Kernel Bridge

The production Worker uses the `PORTAL_KERNEL` Durable Object binding as its
only kernel bridge. Universe, umbrella, and generic kernel requests all pass
through the same `/api/kernel/message` Durable Object endpoint. OS-level
requests are governance-preflighted by the Durable Object and then forwarded
through the typed `MAX_OS_1` service binding. No deployed Worker URL is stored
in application code or configuration.

The Python adapter remains available for local kernel regression development:

```bash
python kernel/http_adapter.py --port 8788
```

The one-message synchronous bridge is also available directly:

```bash
export PORTAL_SERVICE_TOKEN="a-locally-generated-secret"
printf '%s' '{"id":"demo","type":"sim","payload":{},"identity":"a-locally-generated-secret","governanceContext":{}}' \
  | python kernel/boot.py --message
```

Identity tokens are loaded from `PORTAL_SYSTEM_TOKEN`, `PORTAL_SERVICE_TOKEN`,
and `PORTAL_OBSERVER_TOKEN`; there are no built-in production credentials.
Worker API requests use per-login HS256 JWTs. Configure the shared signing key
as a server-only Cloudflare secret before deployment; never place it in a GUI
environment file:

```bash
npx wrangler secret put IDENTITY_JWT_SECRET
```

The token must contain `sub` and future `exp` claims. Its issuer and audience
must match `IDENTITY_JWT_ISSUER` and `IDENTITY_JWT_AUDIENCE` in `wrangler.toml`.
The Worker verifies the signature and claims before forwarding the original
token through the kernel and MAX-OS-1 bindings.

Set `MAXOS_MODULE` when running the Python adapter with an installed MAX-OS-1
module exporting `MaxOsUnifiedOrchestrator`. Without it, Python integration
tests use a deterministic in-memory universe.

### Cloudflare deployment

`wrangler.toml` declares the `PortalKernel` SQLite Durable Object migration, the
`MAX_OS_1` service binding, and the `MAXOS_STATE` KV namespace binding. Create
the KV namespace and replace `YOUR_KV_NAMESPACE_ID` in `wrangler.toml` before
deploying. Deploy MAX-OS-1 first, then validate and deploy this Worker:

```bash
npx wrangler kv namespace create MAXOS_STATE
npm test
npm run check
python -m unittest discover -s tests -p '*.py'
npx wrangler deploy --dry-run
npm run deploy
```

The first live deploy applies the Durable Object migration. `UMBRELLA_ENFORCEMENT`
accepts `strict`, `advisory`, or `off` and defaults safely to `strict` for any
unknown value. The supplied Phase 11 configuration uses `enabled`, which is
therefore normalized to the safe `strict` behavior by the Worker.

For Cloudflare Workers Builds, set the production **Deploy command** to
`npm run deploy`. A Durable Object lifecycle migration cannot be applied by
`wrangler versions upload`, which is the default preview command for
non-production branches. Until the `v1` migration has been applied from the
production branch, either disable non-production branch builds or give a
separate staging Worker a full `wrangler deploy --env staging` flow; do not
remove the migration to make a preview upload pass.

## Development

### Testing Invariants
```bash
python -c "from kernel.invariants import InvariantChecker; InvariantChecker().check_all()"
```

### Rebuild 2 Integration

```bash
python tests/integration_rebuild2.py
npm run check
npm test
```

## Status

- **Rebuild 2**: Complete
- **Architecture**: Defined
- **Core Modules**: Initialized
- **Next Phase**: Create the KV namespace, deploy MAX-OS-1, authenticate Wrangler, deploy planetary-max, then point the GUI environment URLs at the deployed Worker

---

**Last Updated**: 2026-09-22
**Rebuild Phase**: 2  
**Status**: Integrated architecture foundation
