# Qwen3 Next 80B A3B on Bedrock — seed registry data

Source (fetched 2026-07-13):
- https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-qwen-qwen3-next-80b-a3b.html

## Model card
- **bedrock-runtime model ID: `qwen.qwen3-next-80b-a3b`** ✅ (spec seed verified)
  (bedrock-mantle uses `qwen.qwen3-next-80b-a3b-instruct` — not used; we call
  bedrock-runtime Converse only)
- Geo/Global inference profiles: **Not supported** → in-region only.
- Regions (in-region): us-east-1 ✅, us-east-2, us-west-2, eu-south-1, eu-west-1,
  eu-west-2, ap-northeast-1, ap-south-1, ap-southeast-2, sa-east-1.
- Context window: 256K tokens. Max output tokens: 8K.
- Modalities: Text only (no image/video/audio). Converse ✅ / Invoke ✅ /
  Chat Completions ✅. Reasoning: Supported.
- Invoke example uses OpenAI-style body (`messages`, `max_tokens`) — i.e. an
  OpenAI-compatible native schema.

## ⚠️ UNVERIFIED — flagged per CLAUDE.md rule
The AWS docs for this model do NOT publish native parameter ranges/defaults
(temperature/top_p/top_k) or a Converse parameter-routing table. Decisions taken:
- Expose only the base Converse parameters, which Converse validates uniformly:
  maxTokens (1–8192 per card max output), temperature 0–1, topP 0–1, stopSequences
  (Converse InferenceConfiguration constraints).
- Do NOT expose top_k: no documented additionalModelRequestFields contract for Qwen
  on Bedrock. Adding it without a source risks validation errors.
- System prompt: the model card doesn't state support explicitly; Converse maps
  `system` for OpenAI-compatible chat models (developer role mapping documented for
  gpt-oss). Marked supported=true but listed in registry `notes` as unverified —
  needs a live curl check in Stage 3.
