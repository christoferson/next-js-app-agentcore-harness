# Amazon Nova 2 Lite on Bedrock — seed registry data

Sources (fetched 2026-07-13):
- https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-lite.html
- https://docs.aws.amazon.com/nova/latest/nova2-userguide/using-converse-api.html (Nova 2)
- https://docs.aws.amazon.com/nova/latest/userguide/complete-request-schema.html (Nova 1 schema, for topK shape)
- https://docs.aws.amazon.com/nova/latest/userguide/using-converse-api.html (topK routing example)

## Nova 2 Lite model card
- In-region model ID: `amazon.nova-2-lite-v1:0`
- Geo IDs: `us.amazon.nova-2-lite-v1:0`, `eu.amazon.nova-2-lite-v1:0`, `jp.amazon.nova-2-lite-v1:0`
- **Global ID: `global.amazon.nova-2-lite-v1:0`** ✅ (spec seed verified)
- Context window: 1M tokens. Max output tokens: 64K.
- In-region: us-east-1 ❌; Geo ✅ and Global ✅ from us-east-1.
- Modalities: Image ✅, Video ✅, Text ✅. Converse ✅. System prompts ✅, document chat ✅,
  vision ✅, tool use ✅ (Nova 2 Converse guide feature list).

## Nova 2 inference parameters (Converse, verbatim from Nova 2 user guide)
- `maxTokens` (integer): "Maximum number of tokens to generate (up to 65,000). If not
  specified, the model uses a dynamic default based on the request context."
- `temperature` (float): "Controls randomness (0.0-1.0, default 0.7)."
- `topP` (float): "Nucleus sampling threshold (0-1, default 0.9)."
- `stopSequences` (array).
- Nova 1 schema note (applies to Nova family): "You should alter either temperature
  or topP, but not both."

## topK routing (Nova-specific shape!)
Nova's `topK` is NOT a base Converse parameter and uses a NESTED shape in
additionalModelRequestFields (verbatim from Nova Converse guide):

```python
additionalModelRequestFields = {
    "inferenceConfig": {
         "topK": 20
    }
}
```

Nova 1 schema documents topK: "Valid values are between 0 and 128. The default value
is that this parameter is not used." The Nova 2 guide does not re-document topK
ranges; we adopt 0–128 from the Nova family schema.

## Reasoning (not exposed in v1 UI)
`additionalModelRequestFields.reasoningConfig = { type: "enabled"|"disabled",
maxReasoningEffort: "low"|"medium"|"high" }` — default disabled. Note: "Temperature,
topP and topK cannot be used with maxReasoningEffort set to high."
