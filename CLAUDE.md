# CLAUDE.md — Implementation Guidance

Guidance for implementing the Bedrock AgentCore Harness Console (see SPEC.md). Read SPEC.md first; this file governs *how* to build it.

## 1. Ground rules

- **SPEC.md is the contract.** If the spec and this file conflict, ask the user.
- **Never invent SDK packages, operations, or API shapes.** AgentCore is a new service family — package names, operation names, field names, and stream event unions in your training data may be wrong or missing. Every SDK dependency and operation must be verified (§2) before you code against it. This is the single biggest risk in this project.
- **Never invent model IDs or capabilities.** The registry seed in SPEC.md §4.3 is the *intended lineup*, not verified data. If an ID can't be verified in docs or invoked in the account, **flag it to the user — do not guess.**
- **No model-id branching.** Any per-model behavior difference must be expressed as a registry entry. If the registry types can't express it, extend the types — never `if (modelId === ...)` at a call site.
- **Server-only AWS.** No AWS SDK import may be reachable from a client component. Verify with a bundle check before "done".

## 2. SDK & doc verification workflow

Before implementing each wrapper in `lib/agentcore/`:

1. **Resolve the SDK packages.** Check npm for the actual AWS SDK v3 client packages covering the `bedrock-agentcore` and `bedrock-agentcore-control` service models (expected names like `@aws-sdk/client-bedrock-agentcore` / `@aws-sdk/client-bedrock-agentcore-control` — VERIFY, do not assume). Confirm each required command class exists in the installed version:
   - control: `ListHarnesses`, `GetHarness`, `GetMemory`
   - data: `InvokeHarness`, `InvokeAgentRuntimeCommand`, `ListSessions`, `ListEvents`, `ListMemoryRecords`, `QueryMemory`
   - `@aws-sdk/client-bedrock-agent-runtime`: `EndSession`
2. Inspect the installed package's TypeScript types for exact input/output shapes and the streaming event union — the `.d.ts` files are ground truth over memory.
3. Fetch official AWS documentation for each operation; cache pages under `/aws/docs/` and record source URL + fetch date in `/aws/docs/_manifest.md`.
4. If a required operation is missing from the latest published SDK, **stop and ask the user** (they may have a preview/vendored client).
5. Where live API responses diverge from SPEC.md §5 contracts, surface the divergence and update SPEC.md — don't silently adapt.
6. Pin exact SDK versions in `package.json`; record minimum working versions in the README.

## 3. Known shape quirks (verify against docs/types, then handle)

Observed in the reference implementation — treat as required defensive handling:

- **`GetHarness` memory config has two shapes**: `memory.agentCoreMemoryConfiguration.arn` (newer) and `memory.managedMemoryConfiguration.arn` (legacy). Try the first, fall back to the second; extract the memory ID from the ARN segment after `memory/`.
- **Conversational memory payloads are double-encoded**: `payload[].conversational.content.text` is a JSON *string* containing the real envelope (`message` with `role`/`content[]`/`metadata.usage`/`metadata.metrics`, plus `message_id`, `created_at`, `updated_at`). Always `JSON.parse` inside try/catch with fallback to raw text.
- **`ListMemoryRecords` / `QueryMemory` return `memoryRecordSummaries`**, not `memoryRecords`.
- **`GetMemory` strategies may be absent** — fall back to the `retrievalConfig` shape (namespace paths as keys, `strategyId` in values).
- **`InvokeHarness` stream deltas may lack `text`** (tool-use input deltas, possibly reasoning blocks). Never assume `delta.text` exists; unknown delta/event types → log at debug, skip.
- **`InvokeAgentRuntimeCommand` may never emit `contentStop`** — emit `exit-code: -1` on stream end.
- **`EndSession` on an expired session throws** — catch, return `{ended: false, reason}` with HTTP 200; the "New Session" flow must never fail on it.
- **Namespaces are templates** — `{actorId}`/`{sessionId}` substituted before calling; validate the final string is a plain path (no unresolved braces) server-side.

## 4. Layering rules (enforced)

| Module | May use | Must NOT |
|---|---|---|
| `lib/models/*` | zod | import AWS SDK or React |
| `lib/agentcore/clients.ts` | AWS SDK | contain parsing/business logic |
| `lib/agentcore/parsers.ts` | stdlib only (pure) | import AWS SDK, React, or Next |
| `lib/agentcore/invoke.ts`, `command.ts` | clients + parsers + stream events | leak raw AWS event shapes past the adapter |
| route handlers | lib/* , zod | contain parsing logic (delegate to lib) |
| components | typed API responses, `/lib/stream/events` types | import anything from `lib/agentcore` except types |

- All AWS error mapping happens in `clients.ts`: map `AccessDeniedException` → "enable AgentCore access / check IAM", `ThrottlingException` → "retry shortly", `ValidationException` → its message, expired-session errors → readable notice. Return structured `{code, message}`; route handlers translate to HTTP status or SSE `error` events.
- The SSE event union in `lib/stream/events.ts` is the **only** vocabulary the client understands. Client code must handle unknown event types by ignoring them (forward compatibility).
- Server logs: request-scoped, INFO baseline; full payload dumps only at DEBUG. Log final InvokeHarness params (minus message text) at DEBUG so the "unset overrides send no fields" criterion is verifiable.

## 5. Request construction rules

- Build `model.bedrockModelConfig` only from registry-approved, validated values:
  - `temperature` → only if provided AND the registry entry has a `temperature` spec; clamp to range.
  - `maxTokens` → only if provided; clamp to range.
  - Omit the whole `model` param when no override is active. Omit `systemPrompt` when the override is off or empty.
- Send **only the latest user turn** in `messages`. Do not replay client history — the harness + bound memory own conversation state keyed by `runtimeSessionId`.
- Every route validates its body/query with zod before touching AWS. Unknown keys rejected.
- Client aborts propagate: wire the request's `AbortSignal` through to the SDK call so Stop actually cancels the AgentCore stream.

## 6. UI implementation notes

- shadcn/ui components; install only what's used. Dark theme default via `next-themes`.
- Streaming render: append text deltas to a ref-buffered string, flush on animation frame — no per-token re-render of the whole message list. Auto-scroll with scroll-lock when the user scrolls up.
- Tool activity: maintain an ordered list of tool records per in-flight message `{name, toolUseId, input}`; live preview tries `JSON.parse` of the accumulated input, pretty-prints on success, truncates raw at ~120 chars otherwise; collapse to chip on `tool-stop`.
- Inspector pagination is accumulative client-side (Load resets, Load-more appends `nextToken` results).
- Copy buttons on every ID/ARN; skeletons for all async lists; empty states with guidance text, never blank panels.

## 7. Verification checklist before "done"

Work through SPEC.md §10 acceptance criteria one by one. Additionally:

- [ ] `grep` confirms no model-id string comparisons outside the registry, and no AWS SDK imports outside `lib/agentcore/`.
- [ ] Feeding synthetic malformed events (missing `delta.text`, undecodable conversational payload, unknown SSE type) through adapter/parsers/client produces logged warnings + graceful fallback, not exceptions.
- [ ] `next build` succeeds with TypeScript strict; no AWS SDK in the client bundle (check build output / bundle analyzer).
- [ ] `package.json` pins Next, SDK clients, zod, and UI deps to verified versions.
- [ ] `/aws/docs/_manifest.md` lists every doc page consulted with URL + date.
- [ ] README covers: SSO login, required IAM permissions (AgentCore control + data plane, `bedrock-agent-runtime:EndSession`), region config, env setup, run instructions.

## 8. When to stop and ask

Ask the user (do not proceed on assumptions) when:

- The AgentCore SDK client packages can't be found on npm, or a required command class is missing from the latest version.
- A listed model ID cannot be verified or invoked in the account.
- Live API response shapes contradict SPEC.md §5 contracts.
- A per-model behavior difference cannot be expressed in the registry schema.
- The `InvokeHarness` streaming interface in the SDK differs materially from the event union described in §3/SPEC §5.2.