# ConverseStream — request/response + stream event union

Source: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ConverseStream.html
Fetched: 2026-07-13. SDK: @aws-sdk/client-bedrock-runtime 3.1085.0 (`ConverseStreamCommand`).

## Request

`POST /model/{modelId}/converse-stream`

Body fields we use (all optional at the API level):

```jsonc
{
  "messages": [ { "role": "user" | "assistant", "content": [ { "text": "…" } ] } ],
  "system": [ { "text": "…" } ],                 // array of SystemContentBlock
  "inferenceConfig": {
    "maxTokens": 1,                              // Integer, min 1. Default = model max.
    "stopSequences": ["…"],                      // 0–2500 items, each min length 1
    "temperature": 0.5,                          // Float, 0–1. Default = model default.
    "topP": 0.9                                  // Float, 0–1. Default = model default.
  },
  "additionalModelRequestFields": { }            // JSON — model-native params beyond the base set
}
```

- `modelId` may be a base model ID or an inference profile ID (geo `us.` / `eu.` … or
  `global.` prefix).
- `additionalModelRequestFields`: "Additional inference parameters that the model
  supports, beyond the base set of inference parameters that Converse and
  ConverseStream support in the inferenceConfig field."
- Example from the Converse user guide (conversation-inference.html): Anthropic
  `top_k` is not a base parameter — pass `additionalModelRequestFields: {"top_k": 200}`.

## Response stream — event union

Each event in the stream has exactly ONE of these members set:

| Event | Shape / notes |
|---|---|
| `messageStart` | `{ role: string }` |
| `contentBlockStart` | `{ contentBlockIndex: number, start: {...} }` (tool use only) |
| `contentBlockDelta` | `{ contentBlockIndex: number, delta: ContentBlockDelta }` — see below |
| `contentBlockStop` | `{ contentBlockIndex: number }` |
| `messageStop` | `{ stopReason: string, additionalModelResponseFields?: JSON }` |
| `metadata` | `{ usage: {...}, metrics: { latencyMs: number }, trace?, performanceConfig?, serviceTier? }` |
| `internalServerException` | Exception event. HTTP 500. "Retry your request." |
| `modelStreamErrorException` | Exception event. HTTP 424. "A streaming error occurred. Retry your request." |
| `serviceUnavailableException` | Exception event. HTTP 503. |
| `throttlingException` | Exception event. HTTP 429. Account quota exceeded. |
| `validationException` | Exception event. HTTP 400. Input fails constraints. |

### ContentBlockDelta (API_runtime_ContentBlockDelta.html)

"This data type is a UNION, so only one of the following members can be specified when
used or returned."

Members: `citation` | `image` | `reasoningContent` | `text` (String) | `toolResult` |
`toolUse`.

⚠️ `delta.text` may be ABSENT — e.g. reasoning models emit `reasoningContent` deltas.
The stream adapter must check which member is present, never assume `text`.

### MessageStopEvent.stopReason (API_runtime_MessageStopEvent.html)

Valid values (quoted verbatim):

```
end_turn | tool_use | max_tokens | stop_sequence | guardrail_intervened |
content_filtered | malformed_model_output | malformed_tool_use |
model_context_window_exceeded
```

Note: Anthropic's native Messages API additionally documents `refusal`
(Claude Fable 5 emits it at a materially higher rate; classifier can fire
mid-stream after partial output). Treat unknown stopReason values defensively.

### metadata.usage (ConverseStreamMetadataEvent → TokenUsage)

```jsonc
{
  "inputTokens": 0, "outputTokens": 0, "totalTokens": 0,
  "cacheReadInputTokens": 0, "cacheWriteInputTokens": 0   // optional
}
```
`metrics.latencyMs` — number.

## Request-level errors (thrown by `send()`, not in-stream)

| Error | HTTP | Meaning |
|---|---|---|
| `AccessDeniedException` | 403 | Insufficient permissions / model access not enabled |
| `ValidationException` | 400 | Input fails constraints |
| `ThrottlingException` | 429 | Account quota exceeded |
| `ModelNotReadyException` | 429 | Model not ready; SDK auto-retries up to 5 times |
| `ModelTimeoutException` | 408 | Processing exceeded model timeout |
| `ModelErrorException` | 424 | Error while processing the model |
| `ResourceNotFoundException` | 404 | Resource ARN not found |
| `InternalServerException` | 500 | Retryable server error |
| `ServiceUnavailableException` | 503 | Service unavailable |
