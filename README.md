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

The Hono Worker is the only public entrypoint. It validates the GUI bearer
token, builds the shared envelope, and calls the `PortalKernel` Durable Object
through `callKernel()`. The Durable Object owns the lane registry and persists
SIM, substrate, and universe state in Durable Object storage.

The shared envelope is:

```json
{
  "id": "message-123",
  "type": "sim",
  "payload": { "observation": "stable" },
  "identity": "bearer-token",
  "governanceContext": {}
}
```

Successful kernel responses expose aligned `lanes`, `results`, and `output`
fields. GUI routes normalize `output` into `{ ok, data, meta }`.

OS-level messages use an `os.` prefix, for example `os.identity`. When
`MAX_OS_1` or `MAXOS_URL` is configured, `callKernel()` adapts and forwards
those envelopes to MAX-OS-1 at `/kernel/message`. The explicit
`POST /os/kernel/message` route provides the same authenticated bridge for
callers that do not use an `os.*` type. MAX-OS-1 is never called by the GUI
directly, and MAX-OS-1 does not call planetary-max.

The Durable Object binding and its SQLite migration are declared in
`wrangler.toml`. Deploy them together with:

```bash
npm test
npm run check
npx wrangler deploy --dry-run
npx wrangler deploy
```

`wrangler.toml` is already configured with:

- `[[services]]` for the `MAX_OS_1` Worker service binding
- `PortalKernel` Durable Object binding
- SQLite Durable Object migration `v1`
- `MAXOS_STATE` KV namespace `fe764b50bd0740fd9bc37d235d8b0327`
- Phase 11 runtime variables

A Durable Object migration is **not** a D1 migration. Do not run
`wrangler d1 migrations apply`; the `[[migrations]]` declaration is applied by
the first live Worker deployment.

For a fresh checkout:

```bash
git clone https://github.com/maxchaz2/planetary-max.git
cd planetary-max
npm install
npx wrangler login
```

Validate before deployment:

```bash
npm run check
npm test
python -m unittest discover -s tests -p '*.py'
npx wrangler deploy --dry-run
```

Configure the JWT secret and deploy:

```bash
npx wrangler secret put IDENTITY_JWT_SECRET
npm run deploy
```

Deploy the `max-os-1` service before this Worker. The dry run validates the
bundle and bindings but does not apply the Durable Object migration.

## Introspection validation

After deployment, set a valid JWT in `TOKEN` and use the Worker URL in
`WORKER_URL`:

```bash
export WORKER_URL="https://max-os-1.<account>.workers.dev"
export TOKEN="<signed-jwt>"

curl -fsS "$WORKER_URL/health"
curl -fsS -H "Authorization: Bearer $TOKEN" "$WORKER_URL/universe/state"
curl -fsS -H "Authorization: Bearer $TOKEN" "$WORKER_URL/api/introspection/umbrella/enforcement"
curl -fsS -H "Authorization: Bearer $TOKEN" "$WORKER_URL/api/introspection/substrate/state"
curl -fsS -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"changes":{"resources":1}}' \
  "$WORKER_URL/universe/tick"
```

`UMBRELLA_ENFORCEMENT` accepts `strict`, `advisory`, or `off`. The configured
value `enabled` intentionally fails closed to `strict`.

## MAX-Institute truth formation

`PortalKernel` persists the Institute canon and identity-bound epistemic
timelines. Send an authenticated local kernel message with type
`institute.truth.form`; its payload must provide a truth `id`, `description`,
logical timestamp `at`, inference `facts`, `quantumBranches`, and
`simulationDeltas`. It may also include inference `hypotheses` with confidence,
curvature guidance, and collapse-policy suggestions. Every source fact must have quantum support and appear in
at least two distinct simulation ticks. Unstable evidence is rejected without
changing the canon.

The authenticated envelope identity owns the resulting epistemic event; a
caller-supplied identity is never accepted. Read the current state with
`institute.canon.state` or the caller's timeline with
`institute.timeline.state`. Canon versions advance only for material truth
changes. Strict governance accepts `stabilityThreshold` and `curvatureLimit`
in the envelope governance context. The Worker exposes these explicit views:

- `GET /api/introspection/institute/canon`
- `GET /api/introspection/institute/truths`
- `GET /api/introspection/institute/timeline?identityId=<id>`
- `GET /api/introspection/institute/stability`
- `GET /api/introspection/institute/signature`
- `GET /api/introspection/institute/timelines`

## Planetary Mode synchronization

Send an authenticated local kernel message with type `planetary.sync`. Its
payload contains a logical `at` timestamp, a complete `nodes` snapshot array,
a `collapsePolicy`, and a global `governance` context. Each node supplies its
identity replicas, substrates, quantum branches, Institute canon, and
truth-to-quantum signature map. PortalKernel sorts and validates the snapshots,
then atomically replaces planetary state with a deterministic aggregation.

`planetary.tick` runs the full runtime loop over the same payload. Nodes may add
an explicit `tick` and `inferenceDelta`; the runtime emits deterministic
`PlanetaryDelta` objects, computes a SHA-256 `PlanetarySyncPacket` signature,
sets `globalTick` to the maximum node tick, merges global state, updates canon
stability, applies governance, and performs collapse. The selected collapse is
propagated to every node, identity curvature is updated consistently, canon
stability/version advances, and identity-bound epistemic timelines record each
truth update or deprecation. Deterministic and governed collapse select the
highest allowed probability. Probabilistic collapse requires a non-empty `seed`
and uses WebCrypto so identical packets and seeds reproduce the same branch.

Strict mode reconciles divergent identity replicas using stable ordinal choices
and averaged curvature, records the reconciliation in `advisories`, filters
quantum signatures denied by global collapse rules, and only admits canon truths
that are structurally stable with converged signatures on every active node.
Conflicting truths are removed from the global canon and recorded as deprecated
on epistemic timelines. `globalTruthRules.minStability`, `curvatureLimit`, and
per-node `enabled` policies override local state. Current execution state is also
available through the `planetary.state` kernel message and these introspection
views:

- `GET /api/introspection/planetary/identity`
- `GET /api/introspection/planetary/substrate`
- `GET /api/introspection/planetary/quantum`
- `GET /api/introspection/planetary/canon`
- `GET /api/introspection/planetary/governance`
- `GET /api/introspection/planetary/state`

## Development

```bash
python -c "from kernel.invariants import InvariantChecker; InvariantChecker().check_all()"
python tests/integration_rebuild2.py
npm test
npm run check
npm test
```

## Status

- **Rebuild 2**: Complete
- **Architecture**: Defined
- **Core Modules**: Initialized
- **Next Phase**: Configure the optional MAX-OS-1 service binding in each Cloudflare environment

---

**Last Updated**: 2026-09-22  
**Rebuild Phase**: 2  
**Status**: Integrated architecture foundation
