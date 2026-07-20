# OpenAI GPT OSS Safeguard 120B on Bedrock — seed registry data

Sources (fetched 2026-07-13):
- https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-oss-safeguard-120b.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-openai.html

## Model card
- **bedrock-runtime model ID: `openai.gpt-oss-safeguard-120b`** ✅ (spec seed verified)
- Geo/Global inference profiles: **Not supported** → in-region only.
- Regions (in-region): us-east-1 ✅, us-east-2, us-west-2, eu-south-1, eu-west-1,
  eu-west-2, eu-central-1, eu-north-1, ap-northeast-1, ap-south-1, ap-southeast-2/3/4,
  sa-east-1.
- Context window: 128K tokens. Max output tokens: 16K.
- Modalities: Text only. Converse ✅ / Invoke ✅ / Chat Completions ✅.

## Parameter mapping (model-parameters-openai.html, written for gpt-oss family)
- Native schema = OpenAI Create chat completion. On Converse:
  - `developer`-role message content → `system` array (SystemContentBlock) — i.e.
    system prompts ARE supported via Converse.
  - `max_completion_tokens` → `inferenceConfig.maxTokens`
  - `temperature` → `inferenceConfig.temperature`
  - `top_p` → `inferenceConfig.topP`
  - "Include any other fields in the additionalModelRequestFields object."
- AWS example values: `max_completion_tokens: 150, temperature: 0.7, top_p: 0.9`.
- Converse InferenceConfiguration constrains temperature and topP to 0–1; we use
  those bounds (the OpenAI-native 0–2 temperature range is not honored through
  Converse's validation).

## ⚠️ Quirks / flags
- **Streaming deltas may lack `text`**: reasoning output is a documented behavior of
  this family ("If you use InvokeModel, the model reasoning, surrounded by
  <reasoning> tags, precedes the text content"). Via ConverseStream, reasoning
  arrives as `reasoningContent` deltas (ContentBlockDelta union) — the stream
  adapter must not assume `delta.text` exists. Recorded in registry `notes`.
- No documented temperature/top_p defaults for the safeguard variant specifically;
  ranges taken from Converse base constraints, defaults left null (omit unless set).
- top_k: not part of the OpenAI chat-completions schema — not exposed.
- stopSequences: `stop` exists in the OpenAI schema; AWS's field-mapping table (only
  partially rendered in fetch) maps base fields to inferenceConfig — stopSequences is
  a base Converse field, exposed with Converse constraints. Needs live verification.
