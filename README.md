# Bedrock AgentCore Harness Console

A local-only Next.js **operator console** for Amazon Bedrock AgentCore Harnesses.
Discover harnesses in your account, chat with one via the streaming `InvokeHarness`
API, and inspect its runtime and memory subsystem — short-term memory events,
long-term memory records, session lifecycle, and direct shell access to the harness
microVM. See [SPEC.md](./SPEC.md) for the full contract and [CLAUDE.md](./CLAUDE.md)
for implementation guidance.

No auth, no database, no deployment — `npm run dev` and go. Conversation state lives
in the harness's bound AgentCore memory (keyed by `runtimeSessionId`); the backend is
stateless.

## Prerequisites

- **Node.js 20+** and npm.
- An AWS account with **Bedrock AgentCore** enabled in your region, at least one
  **harness** provisioned, and model access granted for the models you intend to use.
- AWS credentials available to the default provider chain (see below).

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the env template and edit it:

   ```bash
   cp .env.local.example .env.local
   ```

   | Variable | Purpose |
   |---|---|
   | `AWS_REGION` | Single region for all AgentCore clients (e.g. `us-east-1`). |
   | `AWS_PROFILE` | Local credentials profile. |
   | `NEXT_PUBLIC_DEFAULT_ACTOR_ID` | Actor identity seed (auth seam, defaults to `default-user`). |

3. **Sign in (SSO).** If your profile uses IAM Identity Center / SSO:

   ```bash
   aws sso login --profile <your-profile>
   ```

   Any provider-chain credential source works (env vars, `~/.aws/credentials`,
   instance role). The app reads them server-side only.

4. Run:

   ```bash
   npm run dev
   ```

   Open <http://localhost:3000>. The harness list loads on first paint; pick a
   harness to enable chat.

## Required IAM permissions

The credentials need both AgentCore planes plus the runtime EndSession action:

- **AgentCore control** (`@aws-sdk/client-bedrock-agentcore-control`):
  `bedrock-agentcore-control:ListHarnesses`, `:GetHarness`, `:GetMemory`.
- **AgentCore data** (`@aws-sdk/client-bedrock-agentcore`):
  `bedrock-agentcore:InvokeHarness`, `:InvokeAgentRuntimeCommand`, `:ListSessions`,
  `:ListEvents`, `:ListMemoryRecords`, `:RetrieveMemoryRecords`.
- **Agent runtime** (`@aws-sdk/client-bedrock-agent-runtime`):
  `bedrock-agent-runtime:EndSession`.

Exact action names may vary by AWS's final AgentCore IAM namespace — grant the
service actions for the operations above. If a call returns `AccessDeniedException`,
the console surfaces a readable notice pointing here.

## How it works

- **Server-only AWS.** All AWS SDK usage is confined to `lib/agentcore/`; the browser
  talks only to typed internal API routes under `app/api/`. Verified: no AWS SDK code
  appears in the client bundle.
- **Model Config Registry.** Overridable model behavior (which inference params a
  model supports, ranges, defaults) is typed metadata in `lib/models/`. Temperature
  controls appear only for models the registry marks as supporting it; the server
  validates and clamps every override. **Adding a model = one registry entry.**
- **Defensive parsing.** Harness streams and memory payloads are heterogeneous
  (text deltas, tool-use blocks, blobs, double-encoded JSON-in-text). Parsers in
  `lib/agentcore/parsers.ts` tolerate missing/unknown shapes and degrade to raw
  display — they never crash on an unexpected event.
- **Streaming.** SSE with a typed event union shared server/client
  (`lib/stream/events.ts`). Stop cancels the fetch, which aborts the AgentCore stream.

## Verified SDK versions

Pinned exact (no `^`/`~`) in `package.json`, verified against installed `.d.ts` types
on 2026-07-20 (see `aws/docs/_manifest.md` for the full verification log, including
three naming divergences from the spec that were resolved against the real SDK):

| Package | Version |
|---|---|
| `next` | 16.2.10 |
| `@aws-sdk/client-bedrock-agentcore` | 3.1090.0 |
| `@aws-sdk/client-bedrock-agentcore-control` | 3.1090.0 |
| `@aws-sdk/client-bedrock-agent-runtime` | 3.1090.0 |
| `zod` | 4.4.3 |

## Notes & flags

- The seed model registry (`lib/models/registry.ts`) carries the SPEC §4.3 intended
  lineup (`global.anthropic.claude-sonnet-4-6`, `claude-sonnet-5`, `claude-opus-4-8`).
  These IDs were **not** live-invoked against a harness in this build — if one fails
  to invoke in your account, it needs verification (per CLAUDE.md §8). Temperature
  support flags follow the live Bedrock Converse verification recorded in
  `aws/docs/bedrock-models/anthropic-claude.md`.
- `npm run build` runs a strict TypeScript check and must pass before shipping.
