# Relay — Implementation Plan

Drop-in middleware that auto-generates an MCP-compatible action interface from existing Node.js routes. One install → any Express / Next.js / Fastify / Hono app becomes agent-readable.

This document is the build plan, not the product plan. The product plan lives in `relay-complete-plan.docx`.

---

## 1. Scope of v0.1 (first ship)

What "v0.1" means here: the smallest thing a developer can `npm install` and immediately point Claude at via MCP, on Express or Next.js. Everything else (Fastify, Hono, Chrome extension, Cloud) is downstream of this.

**Must ship in v0.1**
- `@relay/core` — protocol primitives, Action Graph types, Validator, Emitter, token issuer
- `@relay/express` — adapter that wraps Express apps
- `@relay/next` — adapter for Next.js App Router
- `@relay/mcp` — MCP server (stdio transport) exposing `relay_manifest` / `relay_act` / `relay_validate` / `relay_state`
- `@relay/schema` — shared schema primitives, validator, schema-projection logic
- An example app per adapter + an integration test that runs Claude (via MCP CLI) against the example

**Explicitly NOT in v0.1**
- Fastify / Hono adapters (Phase 2)
- Chrome extension (Phase 3)
- Relay Cloud / managed consent (Phase 4)
- Consent UI flow (Phase 3) — v0.1 ships with site-level + route-level blocking only, no per-user consent
- Cross-language ports (Phase 5+)

---

## 2. Monorepo layout

pnpm workspaces + Turborepo. Standard shape for a protocol with many adapters.

```
Relay/
├── package.json                    # workspace root, pnpm workspace config
├── pnpm-workspace.yaml
├── turbo.json                      # build pipeline (build, test, lint, typecheck)
├── tsconfig.base.json              # shared TS config; per-package extends this
├── .changeset/                     # versioning + release notes
├── .github/workflows/              # CI: build, test, publish on tag
│
├── packages/
│   ├── core/                       # @relay/core — protocol kernel
│   │   ├── src/
│   │   │   ├── action-graph.ts     # types: ActionGraph, ActionDef, IOField
│   │   │   ├── discoverer.ts       # framework-agnostic discovery API
│   │   │   ├── validator.ts        # input validation w/ structured errors
│   │   │   ├── emitter.ts          # builds /relay/manifest, /relay/act, etc.
│   │   │   ├── token.ts            # JWT issuance, scope, revocation
│   │   │   ├── sanitiser.ts        # secret-pattern scanner, error sanitiser
│   │   │   ├── projection.ts       # output schema projection
│   │   │   ├── block-list.ts       # default + custom path blockers
│   │   │   ├── describe.ts         # relay.describe() annotation API
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── schema/                     # @relay/schema — primitives shared by core + adapters
│   │   ├── src/
│   │   │   ├── types.ts            # IOField, FieldType (string|integer|...)
│   │   │   ├── zod-bridge.ts       # Zod -> Relay schema converter
│   │   │   ├── ts-bridge.ts        # (later) TS type -> Relay schema via ts-morph
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── express/                    # @relay/express
│   │   ├── src/
│   │   │   ├── middleware.ts       # relay.middleware() factory
│   │   │   ├── route-scanner.ts    # walks app._router.stack
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── next/                       # @relay/next (App Router only in v0.1)
│   │   ├── src/
│   │   │   ├── wrap.ts             # relay.wrap(handler) for route handlers
│   │   │   ├── route-scanner.ts    # walks `app/**/route.ts`
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── mcp/                        # @relay/mcp — MCP server adapter
│   │   ├── src/
│   │   │   ├── server.ts           # @modelcontextprotocol/sdk server
│   │   │   ├── tools.ts            # relay_manifest, relay_act, etc.
│   │   │   └── bin.ts              # `npx @relay/mcp` entry
│   │   └── package.json
│   │
│   ├── fastify/                    # @relay/fastify (Phase 2)
│   ├── hono/                       # @relay/hono (Phase 2)
│   ├── http/                       # @relay/http — raw Node HTTP adapter (Phase 2)
│   └── chrome/                     # @relay/chrome (Phase 3)
│
├── examples/
│   ├── express-todo/               # canonical Express demo
│   ├── next-shop/                  # canonical Next.js demo
│   └── fastify-bookings/           # Phase 2
│
├── e2e/                            # Playwright + MCP integration tests
│   └── agent-runs.spec.ts          # spins up example, points MCP at it, runs Claude
│
└── docs/
    ├── protocol.md                 # the Action Graph spec
    ├── security.md                 # threat model + sanitisation pipeline
    ├── adapters.md                 # how to write a new framework adapter
    └── mcp.md                      # MCP integration guide
```

**Why this shape**
- `@relay/core` has zero framework dependencies — adapters depend on core, not the other way around. Easier to add languages later (Python port of `@relay/core` is the spec, not a rewrite of an Express plugin).
- `@relay/schema` is its own package because Zod / TypeBox / Valibot bridges will grow; keeping them out of core keeps core slim.
- Adapters are thin (~200-500 LOC each). Most logic lives in core.

---

## 3. The Action Graph — protocol design

Single source of truth that everything else builds on. Locking this down in v0.1 means adapters and MCP can be developed in parallel.

### 3.1 Types (in `@relay/core`)

```ts
// Pseudocode — final types live in packages/core/src/action-graph.ts

type FieldType = "string" | "integer" | "number" | "boolean" | "array" | "object" | "enum"

interface IOField {
  type: FieldType
  required?: boolean
  description?: string
  min?: number; max?: number               // numeric/string-length bounds
  enum?: string[]                           // for type: "enum"
  items?: IOField                           // for type: "array"
  properties?: Record<string, IOField>      // for type: "object"
}

interface ActionDef {
  actionId: string                          // stable, kebab-case
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  path: string                              // original framework path
  label: string                             // human-readable
  description?: string
  inputs: Record<string, IOField>
  returns: Record<string, IOField>
  relayAccess: "allowed" | "denied" | "consent-required"
  consentScope?: string                     // grouping key for consent
  tags?: string[]
}

interface ActionGraph {
  relayVersion: string                      // protocol version
  appName: string
  appVersion?: string
  generatedAt: string                       // ISO timestamp
  actions: ActionDef[]
}
```

### 3.2 Where schemas come from (priority order)

The Discoverer asks each adapter "describe this route." The adapter consults sources in this order:

1. **Explicit `relay.describe()` annotation** — wins always. The escape hatch.
2. **Zod / TypeBox / Valibot schema** attached to the route — detected via well-known patterns (`req.schema`, `zodValidator(...)` middleware, Fastify's `schema` option).
3. **TypeScript types of the handler** — `ts-morph` pass at build time. Optional, opt-in via `relay.config.ts`. Heavy; v0.2.
4. **Path + method heuristic** — `POST /api/orders` with no schema becomes `{ method: POST, path, inputs: {}, returns: {} }`. Manifest still serves; agent gets no validation help.

v0.1 ships (1) + (2) + (4). (3) is v0.2.

### 3.3 Validator behaviour

- Pure function: `validate(actionDef, input) → { ok: true, value } | { ok: false, error: ValidationError }`
- `ValidationError` is the self-correctable shape from the plan doc (`field`, `expected`, `received`, `suggestion`).
- Validator never throws. Errors flow through Emitter as 400 responses.

---

## 4. Adapter contract

Every framework adapter implements one interface so `@relay/core` can stay framework-agnostic.

```ts
interface FrameworkAdapter {
  name: "express" | "next" | "fastify" | "hono" | "http"
  scanRoutes(appHandle: unknown): RawRoute[]            // one-shot at boot
  attachEndpoints(appHandle: unknown, emitter: Emitter): void
  detectCallerType(req: unknown): "human" | "agent" | "unknown"
  installRelayRespond(appHandle: unknown): void         // adds res.relayRespond(...)
}

interface RawRoute {
  method: string
  path: string
  handlerRef: unknown                                   // for later schema inference
  inferredSchemas?: { input?: ZodLike; output?: ZodLike }
}
```

The first version of each adapter is ~200-500 LOC. Adding a new framework later means writing one of these — not changing core.

---

## 5. The four `/relay/*` endpoints

Lives in `@relay/core/emitter.ts`, mounted by each adapter.

| Endpoint | Method | Behaviour |
|---|---|---|
| `/relay/manifest` | GET | Returns Action Graph if caller is authenticated agent. 401 otherwise. |
| `/relay/act/:actionId` | POST | Validate input → call original handler → project output → return JSON. |
| `/relay/validate` | POST | Validate-only. Never invokes the handler. Cheap. |
| `/relay/state` | GET | Returns `{ user, session, currentStep?, lastActions[] }` for multi-step workflows. |

All four sit behind one middleware path prefix (`/relay`) so blocking is one config line.

---

## 6. MCP server (`@relay/mcp`)

Stdio transport in v0.1 (SSE/HTTP transport in v0.2). Built on `@modelcontextprotocol/sdk`.

Four tools, names matching the plan doc:

- `relay_manifest({ url })` → fetches `/relay/manifest`, returns the Action Graph.
- `relay_act({ url, actionId, inputs })` → posts to `/relay/act/:actionId`.
- `relay_validate({ url, actionId, inputs })` → posts to `/relay/validate`.
- `relay_state({ url })` → fetches `/relay/state`.

Auth: MCP server reads `RELAY_TOKEN` from env (or a `--token` CLI flag). Future: per-URL token registry stored in `~/.relay/tokens.json`.

User config (drop into `~/.config/claude/mcp_settings.json`):
```jsonc
{ "mcpServers": { "relay": { "command": "npx", "args": ["-y", "@relay/mcp"] } } }
```

---

## 7. Security — what ships in v0.1

Pulled directly from §7 of the product plan. v0.1 ships the structural parts; consent ships in Phase 3.

| Layer | v0.1 | Later |
|---|---|---|
| Schema projection | yes — only declared `returns` fields reach agent | — |
| Secret pattern scanner | yes — `sk-…`, `AKIA…`, JWTs, PEMs, long hex | extensible patterns config |
| Error sanitiser | yes — wraps thrown errors into `{ error, requestId }` | trace IDs to logger |
| Default block list | yes — `/admin`, `/bank`, `/payment`, `/card`, `/password`, `/token`, `/secret`, `/internal`, `/pii` | configurable per-app |
| `relay.block()` decorator | yes | — |
| `relay.allow()` to override | yes — explicit unblock | — |
| Agent token (JWT) | yes — issued via `relay.issueToken({ scope, ttl })` | IP binding, device fp |
| Token revocation | yes — in-memory store; pluggable | Redis adapter |
| Per-user consent | no | Phase 3 |

---

## 8. Build, test, release

- **Build:** `tsup` per package (ESM + CJS + d.ts). Turborepo pipeline: `lint → typecheck → build → test`.
- **Test:** Vitest per package; `@relay/core` aims for >90% line coverage on Validator + Sanitiser + Token.
- **E2E:** `e2e/` package boots each example app, spawns `@relay/mcp` as a subprocess, drives it via MCP test client, asserts golden-path workflows (login → search → submit) succeed first-attempt.
- **Lint/format:** ESLint + Prettier, shared config in `packages/eslint-config-relay`.
- **Release:** Changesets. `changeset version` bumps + writes changelog; CI publishes on tag push.
- **Docs site:** `docs/` becomes `relay.dev` (Vercel) — Nextra or Astro Starlight. Not in v0.1 scope; ship `README.md` per package first.

---

## 9. v0.1 milestones (suggested 4-week shape)

These are sequencing milestones, not deadlines. Each is independently demoable.

- **M1 — `@relay/core` + `@relay/schema` skeleton, types locked.** ActionGraph types exported, Validator unit-tested against fixtures. No HTTP yet.
- **M2 — `@relay/express` + example Todo app.** `curl /relay/manifest` returns a real graph. `curl /relay/act/create_todo` works end-to-end.
- **M3 — `@relay/next` + example Shop app.** Same behaviour, App Router only. Confirms the adapter contract holds across frameworks.
- **M4 — `@relay/mcp` + integration test.** Claude (via MCP) successfully completes a 5-step workflow against the Express example. Token saving measured and recorded.

Anything beyond M4 (Fastify, Hono, Chrome, Cloud, consent UI) is post-v0.1.

---

## 10. Decisions (locked)

Decided in plan-finalisation pass on 2026-06-04. Not open for re-litigation during scaffolding — change here first if you want a different path.

### 10.1 Scope of v0.1 — M1–M4 only

**Decision:** v0.1 = `@relay/core` + `@relay/schema` + `@relay/express` + `@relay/next` + `@relay/mcp`. No Fastify, no Hono, no Chrome, no consent UI.

**Why:** Two adapters is the minimum to prove the framework-agnostic contract (§4) actually holds. Three+ adapters before the contract is real means rework on every contract change. Fastify/Hono ship in v0.2 once the interface is stable — they should each be a 1-2 day add, not a rewrite.

### 10.2 Schema representation — neutral `IOField`

**Decision:** Relay's own neutral `IOField` (§3.1) is the canonical in-memory schema. Zod / TypeBox / Valibot are *input sources* converted at the adapter boundary via `@relay/schema/zod-bridge` etc.

**Why:** Protocol independence. A Python / Go port of `@relay/core` later cannot import Zod. The manifest JSON shape is the protocol — the in-memory type should mirror it, not a JS-only library. Bridges absorb the heterogeneity.

### 10.3 Dual-mode response — explicit `res.relayRespond(...)`

**Decision:** v0.1 ships explicit `res.relayRespond({...})`. The dev calls it from inside their handler when they want the agent path to return projected output. No interception of `res.json`.

**Why:** Predictable, debuggable, no monkey-patching framework response objects. Interception (b in the previous draft) is doable behind a flag in v0.2 — but only after the projection logic has shipped to real users on the explicit path. Don't add magic before the simple thing is proven.

### 10.4 Next.js — App Router only

**Decision:** App Router only in v0.1. Pages Router scanner is a separate path; deferred unless a user with a Pages Router app shows up.

### 10.5 Token storage — in-memory in v0.1, pluggable from day one

**Decision:** Ship `MemoryTokenStore` as the default. Define `TokenStore` interface from the first commit so Redis / Postgres adapters in v0.2 are additive, not breaking.

### 10.6 License

**Decision:** MIT for every package in this repo (`@relay/core`, `@relay/schema`, `@relay/express`, `@relay/next`, `@relay/mcp`, and all future open adapters). `@relay/cloud` lives in a separate private repo when it exists — not in scope here.

### 10.7 Protocol version

**Decision:** Manifest field `relayVersion: "0.1"`. Bump rules: minor on backward-compatible additions, major on breaking changes to `ActionDef` / `IOField` / endpoint shape. Documented in `docs/protocol.md` (written alongside core).

### 10.8 Toolchain — pinned

| Decision | Choice |
|---|---|
| Node target | Node 20+ (LTS). No support for older runtimes. |
| TS target | ES2022. `moduleResolution: bundler`. Strict. |
| Package manager | pnpm 9+. Workspaces declared in `pnpm-workspace.yaml`. |
| Build orchestrator | Turborepo (`turbo build`, `turbo test`, `turbo lint`, `turbo typecheck`). |
| Per-package bundler | `tsup` — emits ESM + CJS + `.d.ts`. |
| Test runner | Vitest. `@relay/core` Validator + Sanitiser + Token gated to >90% line coverage. |
| Lint | ESLint flat config + Prettier. Shared config package `@relay/eslint-config`. |
| Versioning / publish | Changesets. CI publishes on git tag. |
| Module shape | ESM-first, CJS as compat. `exports` map in every package.json. |
| MCP SDK | `@modelcontextprotocol/sdk` pinned to current latest at scaffold time; bumped via PR with full E2E run. |

---

## 11. Risks specific to the build (not the product)

| Build risk | Why it bites | Mitigation |
|---|---|---|
| Adapter contract changes after v0.1 ships | Forces every adapter rewrite | Lock §4 interface before M2. Add adapters only to validate the contract, not to discover it. |
| Zod / Valibot / TypeBox detection gets brittle | Different middleware patterns per dev | Detect only the canonical patterns. Document the explicit `relay.describe()` path as the always-works fallback. |
| Next.js route scanning by reading `app/**/route.ts` is filesystem-coupled | Won't work in some serverless deploys | Provide a build-time codegen alternative: `relay-next build` writes a static manifest at deploy time. v0.2. |
| MCP SDK churn | Breaks `@relay/mcp` between Claude releases | Pin SDK version; integration test runs on PR. |
| Secret scanner has false positives on legitimate output (e.g. UUIDs flagged as hex) | Devs disable scanner, lose protection | Tune patterns against a corpus of real responses before v0.1. Provide `relay.allowPattern()` escape hatch. |

---

## 12. Ready to scaffold

All decisions in §10 are locked. Next action: scaffold M1.

**M1 scaffold scope (what lands in the first commit):**
- Workspace root: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.changeset/config.json`
- `@relay/eslint-config` — shared lint config
- `@relay/core` skeleton — `ActionGraph` / `ActionDef` / `IOField` types, Validator stub with fixture-driven unit tests, Sanitiser secret-pattern stubs, Emitter stub, Token stub. No HTTP code yet.
- `@relay/schema` skeleton — `IOField` types re-exported, `zodToIOField()` bridge with unit tests.
- `examples/express-todo` — empty Express app, dependency on `@relay/core` + `@relay/express` (latter is empty stub for now).
- CI: GitHub Actions workflow running `pnpm install && pnpm turbo lint typecheck test build` on PR.

After M1 lands and CI is green, M2 = `@relay/express` with real route scanning and the four `/relay/*` endpoints, against the Todo example. M3 = `@relay/next`. M4 = `@relay/mcp` + E2E.

Say "go" and I'll scaffold M1.
