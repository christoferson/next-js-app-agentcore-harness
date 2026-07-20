# SPEC.md — Bedrock AgentCore Harness Console (Local, Next.js)

## 1. Overview

A local-only Next.js application — an **operator console** for Amazon Bedrock AgentCore Harnesses. The backend (Next.js route handlers) calls AgentCore control- and data-plane APIs and streams responses to a polished chat UI. The app discovers harnesses in the account, chats with a selected harness via the streaming `InvokeHarness` API, and provides full observability into the harness's runtime and memory subsystem: short-term memory events, long-term memory records, session management, and direct shell access to the harness microVM.

No auth, no local persistence (state = AgentCore memory + client state), no deployment — `npm run dev` and go.

Four architectural mandates:

1. **Model Config Registry**: overridable model behavior (which inference params a model supports, their defaults/ranges) is modeled as typed metadata. All model-specific behavior — UI controls shown, request fields sent, server-side validation — is driven by this registry, never hardcoded at call sites. **Adding a model = one registry entry.**
2. **Server-only AWS**: AgentCore clients never appear in the client bundle. The browser talks only to typed internal API routes; the harness owns conversation state (via its bound memory + `runtimeSessionId`) — the backend is stateless.
3. **Defensive parsing**: harness streams and memory payloads are heterogeneous (text deltas, tool-use blocks, blob payloads, double-encoded JSON-in-text). Every adapter/parser must tolerate missing/unknown shapes and degrade gracefully — **never crash on an unexpected event**; unknown data falls back to raw display.
4. **Ideal, stylish UI**: this is a demo meant to impress — dark-first console aesthetic, live tool-call activity, animated streaming, keyboard-friendly, information-dense but uncluttered. UI quality is a first-class requirement (see §7), not a nice-to-have.

Default region: `AWS_REGION` env (single region for all clients). Credentials: local `AWS_PROFILE` (SSO supported).

## 2. Goals & Non-Goals

### Goals

- **Harness discovery**: list all harnesses in the account (name, ID, status); server-cached (TTL 5 min) with manual refresh; explicit harness selection.
- **Harness details**: full configuration view — memory binding (ID/ARN, handling *both* `agentCoreMemoryConfiguration` and legacy `managedMemoryConfiguration` shapes), default model + inference config (`modelId`/`temperature`/`maxTokens`/`topP`/`apiFormat`), system prompt (joined from `systemPrompt[].text` blocks), `maxIterations`/`maxTokens`/`timeoutSeconds`, timestamps, raw JSON viewer. Loading details **seeds override defaults** (model, system prompt, maxTokens) in the client.
- **Streaming chat** with the selected harness: token-by-token render, **live tool-use activity** (tool name + accumulating input preview as chips/status line while the agent works), per-response usage footer (tokens in/out/total), markdown rendering with highlighted code blocks.
- **Runtime overrides per invocation**, all optional and registry-gated:
  - model ID (from the registry),
  - temperature (only when the registry says the model supports it),
  - max tokens,
  - system prompt (toggle-gated override, pre-filled with harness-configured prompt, reset-to-default).
  - Unset overrides are **absent from the InvokeHarness request** — harness defaults apply.
- **Session lifecycle**: stable `runtimeSessionId` (UUID) + `actorId` per browser session; "New Session" ends the current session (best-effort) and rotates the ID; **session browser** — list sessions for memory+actor, HAS_EVENTS filter, pagination, conversation preview, **resume** a prior session (rebuild chat history from memory events, adopt its session ID).
- **Short-term memory inspector**: list memory events for `(memoryId, sessionId, actorId)` with accumulative pagination; parse conversational payloads (role, text, message ID, usage, metrics); render USER/ASSISTANT/TOOL/BLOB events with metadata; unknown-role filter.
- **Long-term memory inspector**: discover configured namespaces/strategies via `GetMemory`; list all records or semantic-search (`QueryMemory`) within a namespace; preset namespace templates with `{actorId}`/`{sessionId}` substitution + custom namespace input; record text, strategy, relevance score, raw record.
- **Run Command**: shell access to the harness microVM via `InvokeAgentRuntimeCommand` — preset commands + custom input, terminal-styled output (stdout/stderr/exit code), streamed live. No model reasoning, no token cost.
- **Stop-generation** button (client abort cancels fetch; server aborts the AgentCore stream).
- **Graceful error surfacing** everywhere: AWS errors mapped to readable in-UI messages (access denied, throttling, validation, expired session), request-level AND in-stream.

### Non-Goals (v1 — design for, don't build)

- Harness lifecycle management (create/update/delete harnesses or memories).
- Auth / multi-user (`actorId` is a fixed `default-user`; seam exists — §9).
- Multi-region discovery (single configured region).
- File/image input to chat.
- Cost display, guardrails, CloudWatch dashboards.
- Deployment, Docker, CI/CD, IaC.
- Branch-aware memory event navigation (branch info displayed read-only).

## 3. Architecture

```
Browser (React client — all state client-side)
  │
  │  GET  /api/harnesses                  harness list (server-cached)
  │  GET  /api/harnesses/[id]             details (parsed + raw)
  │  POST /api/chat                       { harnessArn, sessionId, actorId,
  │                                         prompt, overrides } → SSE stream
  │  POST /api/command                    { harnessArn, sessionId, command } → SSE stream
  │  GET  /api/sessions                   list (memoryId, actorId, filter, token)
  │  POST /api/sessions/end               best-effort EndSession
  │  GET  /api/memory/events              STM events (paginated)
  │  GET  /api/memory/namespaces          GetMemory strategies
  │  GET  /api/memory/records             ListMemoryRecords / QueryMemory
  │  GET  /api/models                     client-safe model registry
  ▼
Next.js route handlers (Node runtime — server-only AWS)
  ├── lib/models/registry     validate overrides, gate temperature
  ├── lib/agentcore/clients   cached clients:
  │     bedrock-agentcore-control  → ListHarnesses, GetHarness, GetMemory
  │     bedrock-agentcore          → InvokeHarness, InvokeAgentRuntimeCommand,
  │                                  ListSessions, ListEvents,
  │                                  ListMemoryRecords, QueryMemory
  │     bedrock-agent-runtime      → EndSession
  ├── lib/agentcore/converse  buildInvokeRequest + defensive stream adapter
  └── lib/agentcore/parsers   memory/event/harness payload parsers (pure)
  ▼
SSE back to client (text deltas, tool events, usage, stdout/stderr, errors)
```

- **Stateless backend**: every request carries full context (harness ARN, session ID, actor ID). Conversation state lives in the harness's AgentCore memory — the client sends **only the latest user turn**; client-side history is display-only.
- **Layering** (mirrors the reference implementation's layers, as modules):
  - `lib/agentcore/clients.ts` — thin SDK wrappers only; all AWS error mapping here.
  - `lib/agentcore/parsers.ts` — pure functions (no SDK, no React): harness details extraction, conversational payload decoding, event classification.
  - Route handlers — validation (zod) + wiring only.
  - Components — render parsed/typed data; never touch raw AWS shapes.
- **Streaming**: SSE with a typed event union shared between server and client (`lib/stream/events.ts`):
  `text-delta | tool-start | tool-input-delta | tool-stop | usage | stop | stdout | stderr | exit-code | error`.

## 4. Model Config Registry (the core design)

### 4.1 Types

```ts
// lib/models/types.ts
export interface HarnessModelConfig {
  modelId: string;                 // e.g. "global.anthropic.claude-sonnet-4-6"
  displayName: string;
  temperature?: {                  // present = supported; absent = never shown, never sent
    default: number;
    min: number;                   // 0
    max: number;                   // 1
    step: number;                  // 0.05
  };
  maxTokens: {                     // always overridable
    min: number; max: number; step: number;
    // default comes from harness-configured maxTokens, falling back to `fallbackDefault`
    fallbackDefault: number;
  };
  notes?: string[];                // quirks, verification status
}

export const HARNESS_MODEL_CONFIGS: HarnessModelConfig[] = [ /* seed, §4.3 */ ];
```

### 4.2 Behavior rules

- **UI**: temperature control rendered only if `temperature` is present in the config; otherwise a subtle "not supported for this model" hint — never a runtime error. Ranges/steps/defaults from the registry.
- **Server validation**: `/api/chat` builds a zod schema from the selected model's config — temperature rejected/stripped for unsupported models, values clamped to registry ranges. **Never trust the client.**
- **Request construction**: `model.bedrockModelConfig` built only from registry-approved, user-set values. `temperature` only when set AND supported; `maxTokens` only when override enabled. Omit `model` entirely when no override is active; omit `systemPrompt` entirely when the override is off.
- **No model-id branching at call sites**: any per-model difference must be expressible as registry metadata. Extend the types if needed (`topP`, token ceilings) — don't add `if (modelId === ...)`.
- **Adding a model = one registry entry. Nothing else changes.**

### 4.3 Seed registry

All IDs and capability flags MUST be verified against official docs / account access (see CLAUDE.md) — intended lineup, not verified data:

| displayName | modelId | expected shape |
|---|---|---|
| Claude Sonnet 4.6 (default) | `global.anthropic.claude-sonnet-4-6` | temperature supported, default 0.1 |
| Claude Sonnet 5 | `global.anthropic.claude-sonnet-5` | temperature NOT supported — verify |
| Claude Opus 4.8 | `global.anthropic.claude-opus-4-8` | temperature NOT supported — verify |

If an ID can't be verified or isn't invocable in the account, **flag to the user — do not guess**.

## 5. API Contracts

### 5.1 Harness discovery & details

- `GET /api/harnesses` → `ListHarnesses`; returns `[{arn, name, id, status}]`. Server-cached 5 min; `?refresh=1` busts the cache.
- `GET /api/harnesses/[id]` → `GetHarness`; server-side parser extracts (defensively):
  - `memoryId`: `memory.agentCoreMemoryConfiguration.arn` first, falling back to `memory.managedMemoryConfiguration.arn`; ID parsed from the ARN segment after `memory/`. Absent → `memoryId: null`, memory features hidden client-side.
  - model defaults from `model.bedrockModelConfig`.
  - system prompt joined from `systemPrompt[].text`.
  - limits, timestamps, description, plus `raw` (full response) for the JSON viewer.

### 5.2 Chat — `POST /api/chat` (SSE)

Request body:

```json
{
  "harnessArn": "…", "sessionId": "…", "actorId": "…",
  "prompt": "latest user message",
  "overrides": {
    "modelId": "…",           // optional — must exist in registry
    "temperature": 0.1,        // optional — registry-gated, clamped
    "maxTokens": 4096,         // optional
    "systemPrompt": "…"        // optional
  }
}
```

Server builds `InvokeHarness` params:

```
{ harnessArn, runtimeSessionId, actorId,
  messages: [{ role: "user", content: [{ text: prompt }] }],   // latest turn ONLY
  model?: { bedrockModelConfig: {...} },                        // registry-gated
  systemPrompt?: [{ text }] }
```

Stream adapter maps AgentCore events → typed SSE events (**defensive — unknown events logged + skipped**):

| AgentCore event | SSE event |
|---|---|
| `contentBlockStart.start.toolUse` | `tool-start { name, toolUseId }` |
| `contentBlockDelta.delta.text` | `text-delta { text }` |
| `contentBlockDelta.delta.toolUse.input` | `tool-input-delta { toolUseId, input }` |
| `contentBlockStop` | `tool-stop` |
| `messageStop.stopReason` | `stop { stopReason }` |
| `metadata.usage` | `usage { inputTokens, outputTokens, totalTokens }` |
| in-stream / request exceptions | `error { code, message }` (mapped to readable text) |

Client abort (Stop button) cancels the fetch; the route handler aborts the AgentCore stream.

### 5.3 Sessions & short-term memory

- `GET /api/sessions?memoryId=&actorId=&hasEventsOnly=&maxResults=&nextToken=` → `ListSessions` (optional `filter: {eventFilter: 'HAS_EVENTS'}`); returns `sessionSummaries` + `nextToken`. Pagination is accumulative **client-side**.
- `POST /api/sessions/end { sessionId }` → `EndSession` via `bedrock-agent-runtime`; **best-effort** — expired sessions return `{ ended: false, reason }`, never a 5xx.
- `GET /api/memory/events?memoryId=&sessionId=&actorId=&maxResults=&nextToken=&includePayloads=` → `ListEvents`. The server parser decodes **double-encoded** conversational payloads: `payload[].conversational.content.text` is a JSON *string* containing `{message: {role, content[], metadata: {usage, metrics}}, message_id, created_at, updated_at}` — `JSON.parse` with fallback to raw text. Response items are pre-classified: `{type: 'conversational' | 'blob' | 'unknown', role?, text?, usage?, metrics?, raw}`.
- **Resume**: client rebuilds chat history from a previewed session's USER/ASSISTANT events (chronological) and adopts its `sessionId`. No server endpoint needed beyond `/api/memory/events`.

### 5.4 Long-term memory

- `GET /api/memory/namespaces?memoryId=` → `GetMemory`; returns strategies `{name, type, strategyId, namespaces[], status}` with fallback to the `retrievalConfig` shape if `strategies` is absent.
- `GET /api/memory/records?memoryId=&namespace=&query=&maxResults=` → `QueryMemory` when `query` present, else `ListMemoryRecords`. Both return **`memoryRecordSummaries`** (not `memoryRecords`). Namespace templates (`{actorId}`/`{sessionId}`) are substituted **client-side** before the call; server validates the final namespace is a plain path.

### 5.5 Runtime command — `POST /api/command` (SSE)

- Body `{ harnessArn, sessionId, command }` → `InvokeAgentRuntimeCommand` with `body: {"command": …}`.
- Stream: `chunk.contentDelta.{stdout,stderr}` → `stdout`/`stderr` SSE events; `chunk.contentStop.exitCode` → `exit-code`. If `contentStop` never arrives, emit `exit-code { code: -1 }` on stream end.

## 6. Frontend UX

### Layout

- **App shell**: fixed left sidebar (~320px, collapsible) + main chat area. Dark-first (light mode supported via `next-themes`), Tailwind + shadcn/ui, `lucide-react` icons, Geist/Inter typography, `tabular-nums` for IDs and metrics.
- **Sidebar** (top → bottom):
  - Harness selector (combobox: `name · status` with status color dot) + refresh icon-button; selected-harness card (name, ID, truncated ARN with copy-button, status badge, "Details" button).
  - **Overrides panel** (collapsible): model select (from registry), switch-gated temperature slider (registry-gated, hint when unsupported), switch-gated max-tokens input, switch-gated system-prompt textarea (pre-filled with configured prompt, reset-to-default link).
  - **Session card**: session ID, actor ID, memory ID (each with copy-button; violet accent).
  - Inspector buttons (rendered only when `memoryId` resolved): *Memory Events*, *Long-Term Memory*, *Sessions*.
  - *Run Command* button; **New Session** button (destructive-subtle style).
- **Chat area**:
  - Empty state: harness-selection prompt with a short "what is a harness" blurb.
  - Messages: user right-aligned bubbles, assistant left with harness avatar; markdown + syntax-highlighted code blocks; streaming text with subtle cursor animation.
  - **Tool activity**: while the agent calls tools, an inline activity row above the growing response — spinner + `Calling {toolName}` + live-updating monospace input preview (pretty-printed JSON when parseable, truncated raw otherwise). On completion, collapses into a compact tool chip (name + expandable input) attached to the message.
  - **Usage footer** per assistant message: tokens in/out/total (+ stop reason notice when not `end_turn`).
  - Composer: auto-growing textarea, Enter=send / Shift+Enter=newline, Stop button while streaming, subtle disabled state when no harness selected.
  - Errors render as inline styled notices in the conversation, not toasts-only.

### Inspectors (shadcn `Sheet` for lists, `Dialog` for details)

- **Harness Details** (Dialog): sectioned layout — Identity / Limits / Memory / Default Model & Inference / System Prompt / Timestamps; raw-JSON collapsible viewer.
- **Memory Events** (Sheet, wide): controls row (include-payloads, skip-unknown-role, max-results), Load / Load-more (accumulative), event timeline newest-first — role-iconed collapsible cards (👤 USER / 🤖 ASSISTANT / 🔧 TOOL / 📦 BLOB), first expanded; per-event usage/metrics/IDs; raw metadata expander.
- **Long-Term Memory** (Sheet): namespace strategy list (from `GetMemory`), namespace template select + custom input with live `{actorId}`/`{sessionId}` substitution preview; tabs *List All* / *Search* (query input + max-results); record cards with text, strategy, created-at, relevance score (search), raw-record expander.
- **Sessions** (Sheet): HAS_EVENTS filter, paginated list (current session highlighted), per-session *Preview* → inline conversation snippet list → **Resume** button.
- **Run Command** (Dialog): preset command select + input, terminal-styled output panel (monospace, dark, stdout/stderr differentiated, exit-code badge green/amber), streamed live.

### Polish requirements

- Loading skeletons for harness list and inspectors; optimistic disable states; copy-to-clipboard affordances on all IDs/ARNs.
- Color conventions: violet = identity/context, blue = data, amber = unsupported-feature hints, red = errors.
- Keyboard: `⌘K`/`Ctrl+K` opens the harness combobox; `Esc` closes sheets/dialogs.
- No layout shift during streaming; smooth auto-scroll with scroll-lock when user scrolls up.

## 7. Tech Stack

- Next.js (App Router), TypeScript strict. **Node runtime** for all API routes.
- AWS SDK v3 clients for `bedrock-agentcore`, `bedrock-agentcore-control`, `bedrock-agent-runtime` — package names and operation support MUST be verified (see CLAUDE.md); versions pinned.
- zod (override validation built from registry; request body validation on every route).
- Tailwind CSS + shadcn/ui + lucide-react + next-themes; react-markdown + syntax highlighter.
- No database, no auth libraries.

## 8. Configuration

```bash
# .env.local (from committed .env.local.example)
AWS_REGION=us-east-1
AWS_PROFILE=<profile>              # SSO: run `aws sso login` first
DEFAULT_ACTOR_ID=default-user
```

- Model registry lives in code (typed), not env.
- `actorId` seeds from `DEFAULT_ACTOR_ID`; held in client state (seam, §9).

## 9. Extensibility Seams (build these shapes now, features later)

- **Actor identity**: single `useActor()` hook returning the seeded constant — future auth (Cognito/OIDC) replaces the hook; memory scoping and sessions already key on it.
- **Registry schema**: extend with new capability keys (`topP`, reasoning budget, ceilings) without touching request/render code beyond gated blocks.
- **Multi-region**: clients constructed in one factory (`clientsFor(region)`, cached per region); a per-harness region field slots in later.
- **Namespace presets**: preset list is data — replaceable with dynamic population from `GetMemory` strategies.
- **Metrics hook**: `MetricsSink` interface invoked with per-response usage (no-op in v1; CloudWatch sink later).
- **Deployment**: clean server/client boundaries + env-driven config so ECS/CDK can be bolted on unchanged.

## 10. Acceptance Criteria

- [ ] `npm run dev` + valid `AWS_PROFILE` → harness list loads at `localhost:3000`; refresh re-fetches; selecting a harness enables chat.
- [ ] Harness Details shows memory ID (**both** config shapes handled), model defaults, system prompt, limits, timestamps, raw JSON; loading details seeds override defaults.
- [ ] Chat streams token-by-token; tool calls show live activity (name + accumulating input preview) that collapses into an expandable tool chip; usage footer appears per response; Stop halts generation immediately.
- [ ] Temperature control appears **only** for registry-supported models; the server strips/rejects temperature for unsupported models and clamps out-of-range values; unset overrides send **no** corresponding InvokeHarness fields (verifiable in debug logs); no `model` block when no override is active.
- [ ] System prompt override round-trips; reset restores the configured prompt; disabled → no `systemPrompt` in the request.
- [ ] New Session ends the old one (tolerating already-expired without error), rotates the session ID, clears chat state.
- [ ] Sessions sheet lists sessions (HAS_EVENTS filter + pagination), previews conversations, and Resume rebuilds chat history and adopts the session ID.
- [ ] Memory Events sheet paginates accumulatively, decodes double-encoded conversational payloads (role/text/usage/metrics), renders BLOB payloads; unknown-role filter works.
- [ ] Long-Term Memory sheet lists namespaces from `GetMemory` (both shapes), lists AND semantically searches records with template substitution, shows relevance scores.
- [ ] Run Command streams stdout/stderr live with a terminal aesthetic and exit-code badge; missing `contentStop` yields exit code −1, not a hang/crash.
- [ ] Malformed/unknown stream events, undecodable payloads, missing fields **never crash** server or client — logged + degraded to raw/preview display.
- [ ] AWS errors (access denied, throttling, validation, expired session — request-level AND in-stream) render as readable in-UI messages.
- [ ] No AWS SDK code in the client bundle.
- [ ] Adding a model requires **ONLY** a new registry entry.

## 11. Project Structure

```
/app
  page.tsx                      # console shell (sidebar + chat)
  /api
    /harnesses/route.ts         # list (cached)
    /harnesses/[id]/route.ts    # details
    /chat/route.ts              # SSE — InvokeHarness
    /command/route.ts           # SSE — InvokeAgentRuntimeCommand
    /sessions/route.ts          # ListSessions
    /sessions/end/route.ts      # EndSession (best-effort)
    /memory/events/route.ts     # ListEvents (+ payload decoding)
    /memory/namespaces/route.ts # GetMemory
    /memory/records/route.ts    # ListMemoryRecords / QueryMemory
    /models/route.ts            # client-safe registry
/lib
  /models
    types.ts                    # HarnessModelConfig
    registry.ts                 # seed entries (data only)
    validate.ts                 # zod-from-registry override validation
  /agentcore
    clients.ts                  # cached SDK clients + error mapping
    invoke.ts                   # buildInvokeRequest + stream adapter (chat)
    command.ts                  # command stream adapter
    parsers.ts                  # pure parsers: harness details, events, records
  /stream
    events.ts                   # typed SSE event union (shared server/client)
  /metrics
    metrics-sink.ts             # interface + no-op stub
/components
  /chat                         # messages, composer, tool-activity, usage footer
  /sidebar                      # harness selector, overrides, session card
  /inspectors                   # details dialog, events/ltm/sessions sheets, command dialog
  /ui                           # shadcn
/aws/docs                       # cached official docs + _manifest.md (see CLAUDE.md)
.env.local.example
```