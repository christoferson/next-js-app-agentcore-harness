# Prompt Caching — Converse / ConverseStream

Sources (fetched 2026-07-14):
- https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html
- https://docs.aws.amazon.com/boto3/latest/reference/services/bedrock-runtime/client/converse_stream.html
- Verified against pinned SDK `@aws-sdk/client-bedrock-runtime@3.1085.0`
  (`dist-types/models/models_0.d.ts`).

## Concept

- Cache = contiguous **prompt prefix** marked by `cachePoint` checkpoint blocks.
  Prefix must be byte-stable between requests; any change upstream of a
  checkpoint is a cache miss.
- Checkpoints are processed in order **tools → system → messages**; minimum
  token count is evaluated against the CUMULATIVE tokens across all three
  sections. Changing an earlier section invalidates later sections' caches.
- Below the model's minimum tokens the request still SUCCEEDS — the prefix is
  simply not cached (no error).
- TTL resets on each cache hit. Default 5 minutes.
- Billing: cache reads discounted; cache writes may cost more than uncached
  input. `inputTokens` in usage counts ONLY non-cached tokens:
  `total input = inputTokens + cacheReadInputTokens + cacheWriteInputTokens`.
- On-demand inference only (no batch). Works with cross-region inference.

## Request shape (Converse / ConverseStream)

`cachePoint` is a member of three tagged unions — `ContentBlock` (messages),
`SystemContentBlock` (system), and `Tool` (toolConfig.tools):

```jsonc
{ "cachePoint": { "type": "default" } }            // 5m default TTL
{ "cachePoint": { "type": "default", "ttl": "1h" } } // extended TTL (supported models only)
```

SDK 3.1085.0: `CachePointBlock { type: CachePointType /* 'default' */; ttl?: CacheTTL /* '5m'|'1h' */ }`.

Example — system checkpoint:

```jsonc
"system": [
  { "text": "…static system prompt…" },
  { "cachePoint": { "type": "default" } }
]
```

Example — messages checkpoint (end of a user message's content array):

```jsonc
"messages": [{
  "role": "user",
  "content": [
    { "text": "…" },
    { "cachePoint": { "type": "default" } }
  ]
}]
```

## Response usage fields

`metadata.usage` (TokenUsage, SDK 3.1085.0 — cache fields optional):

- `cacheReadInputTokens?: number` — input tokens read from cache
- `cacheWriteInputTokens?: number` — input tokens written to cache
- `cacheDetails?: CacheDetail[]` — write breakdown by TTL (1h before 5m)

## Supported models (from user-guide table — only rows relevant to our registry)

| Model | Model ID | Min tokens/checkpoint | Max checkpoints | TTL | Fields |
| --- | --- | --- | --- | --- | --- |
| Claude Opus 4.6 | anthropic.claude-opus-4-6-v1 | 4,096 | 4 | 5m | system, messages, tools |

The table does NOT list Claude Sonnet 5, Fable 5, Opus 4.8, Nova 2 Lite, Qwen3,
or GPT-OSS (guide defers to per-model "Models at a glance" cards). The guide
states Amazon Nova has AUTOMATIC caching for text prompts and recommends
opting into explicit caching, but gives no Converse min-token/checkpoint data
for Nova 2 Lite. OpenAI caching guidance in the guide applies to the Responses
API on `bedrock-mantle` (GPT-5.6 family), NOT to Converse GPT-OSS models.

→ Per CLAUDE.md: caching support for unlisted registry models was
  LIVE-VERIFIED 2026-07-14 (`cache-probe.ts`, us-east-1, two identical
  Converse calls per model with a ~20k-token system prefix + cachePoint):

| Model | Result |
| --- | --- |
| global.anthropic.claude-sonnet-5 | ✅ write 19743 → read 19743 |
| global.anthropic.claude-fable-5 | ✅ write 19743 → read 19743 |
| global.anthropic.claude-opus-4-8 | ✅ write 19743 → read 19743 |
| global.anthropic.claude-opus-4-6-v1 | ✅ write 10922 → read 10922 |
| global.amazon.nova-2-lite-v1:0 | ✅ write 10544 → read 10544 |
| qwen.qwen3-next-80b-a3b | ❌ AccessDeniedException "unsupported model or your request did not allow prompt caching" |
| openai.gpt-oss-safeguard-120b | ❌ AccessDeniedException (same) |

Min tokens/checkpoint for Sonnet 5 / Fable 5 / Opus 4.8 / Nova 2 Lite remain
undocumented → `minTokensPerCheckpoint` omitted in the registry (below-minimum
requests succeed uncached, so no clamp is needed). On call 2 the Claude 5-gen
models returned `cacheWriteInputTokens: undefined` (absent) rather than 0 —
the field is optional; treat absent as 0.

## Anthropic simplified cache management

Claude models: a SINGLE checkpoint at the end of static content is enough —
Bedrock auto-checks for cache hits at prior block boundaries, looking back
~20 content blocks. For multi-turn chat this means: checkpoint after the
system prompt + checkpoint at the end of the latest user message; the next
turn's lookback finds the previous turn's prefix automatically.

1h + 5m checkpoints may be mixed, but longer TTLs must appear before shorter.
