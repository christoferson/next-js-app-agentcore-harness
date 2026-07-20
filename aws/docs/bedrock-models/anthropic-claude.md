# Anthropic Claude models on Bedrock — seed registry data

Sources (fetched 2026-07-13):
- https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-fable-5.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-4-8.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-4-6.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages-request-response.html
- https://platform.claude.com/docs/en/api/messages (parameter ranges)
- https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html (top_k routing)

## Parameter semantics (Messages API, applies via Converse)

- `max_tokens` — required (Converse: `inferenceConfig.maxTokens`). Per-model max = "Max
  output tokens" below.
- `temperature` — "Defaults to 1.0. Ranges from 0.0 to 1.0." (Anthropic API reference)
  → Converse `inferenceConfig.temperature`.
- `top_p` — nucleus sampling; "modify either temperature or top_p. Do not modify both
  at the same time" (Bedrock Claude Messages doc). Range 0–1 (Converse
  InferenceConfiguration constraint). → Converse `inferenceConfig.topP`.
- `top_k` — "Only sample from the top K options… Use top_k to remove long tail low
  probability responses." NOT a base Converse parameter → must go in
  `additionalModelRequestFields: {"top_k": <int>}` (example value 200 in AWS docs;
  no documented min/max — we expose 0–500 in UI as a pragmatic slider bound, values
  are ints ≥ 0).
- `stop_sequences` — max 8191 entries (Bedrock doc); Converse
  `inferenceConfig.stopSequences` caps at 2500 items — the lower Converse bound wins.
- Streaming refusals: `stop_reason: "refusal"` can arrive mid-stream (documented for
  Claude Fable 5 at materially higher rates; `stop_details` may accompany it).

## Live verification (curl against us-east-1, 2026-07-13)

Bedrock's live behavior is STRICTER than the model cards for the Claude 5-generation
lineup (and Opus 4.8):

| Model | temperature | top_p | top_k |
|---|---|---|---|
| Sonnet 5 | ❌ "`temperature` is deprecated for this model" | ✅ 0.99 works, ❌ 0.5 "`top_p` is deprecated" (Fable-style band applies) | ❌ "`top_k` is deprecated" |
| Fable 5 | ❌ (per card) | ✅ 0.99 | ❌ (per card) |
| Opus 4.8 | ❌ deprecated | ✅ 0.99, ❌ 0.5 | ❌ deprecated |
| Opus 4.6 | ✅ 0.5 works | ✅ (but NOT together with temperature: "cannot both be specified") | ✅ 50 works via additionalModelRequestFields.top_k |

Registry therefore exposes: Opus 4.6 → temperature/topP/topK/stopSequences;
Sonnet 5, Fable 5, Opus 4.8 → topP (0.99–0.999) + stopSequences only.

## Model cards

### Claude Sonnet 5
- In-region model ID: `anthropic.claude-sonnet-5`
- Geo IDs: `us.anthropic.claude-sonnet-5`, `eu.anthropic.claude-sonnet-5`
- **Global ID: `global.anthropic.claude-sonnet-5`** ✅ (spec seed verified)
- Context window: 1M tokens. Max output tokens: 128K.
- In-region availability: us-east-1 ✅ (also eu-west-1). Global available from us-east-1.
- Modalities: Image input ✅, Text ✅. Converse ✅ (streaming via ConverseStream).
- Reasoning: "adaptive thinking is always on and cannot be disabled".
- Sampling: no card-level restriction; Messages-API guidance "either temperature or
  top_p, not both" applies (hard error documented for Sonnet 4.5/Haiku 4.5; treat as
  guidance note here).

### Claude Fable 5
- In-region model ID: `anthropic.claude-fable-5`
- Geo ID: `us.anthropic.claude-fable-5`
- **Global ID: `global.anthropic.claude-fable-5`** ✅ (spec seed verified)
- Context window: 1M tokens. Max output tokens: 128K.
- In-region: us-east-1 ✅. Global from all listed regions.
- Modalities: Image input ✅, Text ✅. Converse ✅.
- **Sampling restrictions (verbatim):** "temperature must be 1.0 or unset; top_p must
  be ≥ 0.99 and < 1.0, or unset; top_k is not supported"
- Content restrictions: blocking classifiers for dual-use content; HTTP 200 with
  `stop_reason: "refusal"` + `stop_details`; handle refusal as a primary response path.
- Data retention: requires opt-in to provider data sharing (`provider_data_share`).

### Claude Opus 4.8
- In-region model ID: `anthropic.claude-opus-4-8` (in-region endpoint listed N/A —
  use inference profiles)
- Geo IDs: `us.` / `eu.` / `jp.` / `au.` + `anthropic.claude-opus-4-8`
- **Global ID: `global.anthropic.claude-opus-4-8`** ✅ (spec seed verified)
- Context window: 1M tokens. Max output tokens: 128K.
- In-region: us-east-1 ✅. Modalities: Image ✅, Text ✅. Converse ✅. Reasoning supported.
- No card-level sampling restrictions documented.

### Claude Opus 4.6
- In-region model ID: `anthropic.claude-opus-4-6-v1`
- Geo IDs: `us.` / `eu.` / `au.` + `anthropic.claude-opus-4-6-v1`
- **Global ID: `global.anthropic.claude-opus-4-6-v1`** ✅ (spec seed verified)
- Context window: 1M tokens. Max output tokens: 128K.
- In-region: us-east-1 ❌ (only eu-west-2/London in-region); Geo/Global ✅ from
  us-east-1 → use the global ID from the default region.
- Modalities: Image ✅, Text ✅. Converse ✅. Reasoning supported.
