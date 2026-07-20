import 'server-only';
import {
  InvokeHarnessCommand,
  type InvokeHarnessCommandInput,
} from '@aws-sdk/client-bedrock-agentcore';
import { clientsFor } from './clients';
import type { StreamEvent } from '@/lib/stream/events';
import type { HarnessModelConfig } from '@/lib/models/types';
import type { ValidatedOverrides } from '@/lib/models/validate';

// buildInvokeRequest + defensive InvokeHarness stream adapter (CLAUDE.md §4).
// Raw AWS event shapes never leak past this adapter — it emits only StreamEvent.

export interface BuildInvokeParams {
  harnessArn: string;
  runtimeSessionId: string;
  actorId: string;
  prompt: string;
  overrides: ValidatedOverrides;
  /** the effective model config, when an override modelId resolved */
  model?: HarnessModelConfig;
}

/**
 * Build InvokeHarness params (SPEC §5.2, §5, CLAUDE.md §5):
 * - Send ONLY the latest user turn in `messages` — the harness + bound memory
 *   own conversation state keyed by runtimeSessionId.
 * - `model.bedrockModelConfig` built only from registry-approved, validated
 *   values: temperature only if provided AND supported; maxTokens only if
 *   provided. Omit the whole `model` param when no override is active.
 * - Omit `systemPrompt` when the override is off/empty.
 */
export function buildInvokeRequest(
  p: BuildInvokeParams
): InvokeHarnessCommandInput {
  const req: InvokeHarnessCommandInput = {
    harnessArn: p.harnessArn,
    runtimeSessionId: p.runtimeSessionId,
    actorId: p.actorId,
    messages: [{ role: 'user', content: [{ text: p.prompt }] }],
  };

  const bedrockModelConfig: Record<string, unknown> = {};
  if (p.overrides.modelId) {
    bedrockModelConfig.modelId = p.overrides.modelId;
  }
  if (typeof p.overrides.maxTokens === 'number') {
    bedrockModelConfig.maxTokens = p.overrides.maxTokens;
  }
  // Temperature only when supported by the resolved model AND provided.
  if (
    typeof p.overrides.temperature === 'number' &&
    p.model?.temperature !== undefined
  ) {
    bedrockModelConfig.temperature = p.overrides.temperature;
  }
  // A model config needs a modelId to be valid; only attach when we set one.
  if (bedrockModelConfig.modelId) {
    req.model = {
      bedrockModelConfig: bedrockModelConfig as { modelId: string },
    };
  }

  if (p.overrides.systemPrompt && p.overrides.systemPrompt.trim().length > 0) {
    req.systemPrompt = [{ text: p.overrides.systemPrompt }];
  }

  return req;
}

/** Redact message text for DEBUG logging (CLAUDE.md §4). */
export function redactInvokeParams(
  req: InvokeHarnessCommandInput
): Record<string, unknown> {
  return {
    ...req,
    messages: `<${req.messages?.length ?? 0} message(s)>`,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Stream debug logging (opt-in). Enable by setting AGENTCORE_DEBUG_STREAM=1
 * (works in dev AND production builds) — logs the STRUCTURAL InvokeHarness events
 * (block starts/stops, tool results, message stop, metadata) so the real tool /
 * citation shape can be captured for verification (CLAUDE.md §2/§8). The high-
 * volume text/tool-input deltas are NOT logged per-event — they're summarized as
 * counts at stream end, so the log stays readable. Off by default.
 */
const STREAM_DEBUG = process.env.AGENTCORE_DEBUG_STREAM === '1';

/**
 * Classify a delta event that we summarize rather than log line-by-line. All
 * three delta kinds stream in many fragments (tool-result content can be a
 * full page scrape — huge), so per-event logging floods. Block starts/stops,
 * messageStop and metadata are NOT noisy and always log in full.
 */
function noisyDeltaKind(
  event: Record<string, unknown>
): 'text' | 'toolInput' | 'toolResult' | null {
  if (!isRecord(event.contentBlockDelta)) return null;
  const delta = event.contentBlockDelta.delta;
  if (!isRecord(delta)) return null;
  if (typeof delta.text === 'string') return 'text';
  if (isRecord(delta.toolUse)) return 'toolInput';
  if (delta.toolResult !== undefined) return 'toolResult';
  return null;
}

function debugStructuralEvent(event: unknown): void {
  if (!STREAM_DEBUG) return;
  if (isRecord(event) && noisyDeltaKind(event)) return; // summarized instead
  let json: string;
  try {
    json = JSON.stringify(event);
  } catch {
    json = '<unserializable>';
  }
  if (json.length > 4000) json = json.slice(0, 4000) + `…<truncated ${json.length} chars>`;
  console.debug(`[invoke] ${json}`);
}

/**
 * Flatten a tool-result delta ARRAY to text (verified shape, SDK type
 * `HarnessToolResultBlockDelta[]`): each item is `{text}` or `{json}`. A search
 * tool typically returns JSON-encoded sources here. Defensive: tolerates any
 * odd item without throwing.
 */
function flattenToolResultDelta(items: unknown): string {
  const arr = Array.isArray(items) ? items : [items];
  const parts: string[] = [];
  for (const c of arr) {
    if (typeof c === 'string') parts.push(c);
    else if (isRecord(c)) {
      if (typeof c.text === 'string') parts.push(c.text);
      else if (c.json !== undefined) {
        try {
          parts.push(JSON.stringify(c.json));
        } catch {
          /* skip unserializable */
        }
      }
    }
  }
  return parts.join('');
}

/**
 * Defensive adapter: InvokeHarness stream events → StreamEvent (SPEC §5.2).
 * Unknown event/delta types are logged at debug and skipped — never crash
 * (CLAUDE.md §3: deltas may lack `text`; tool-use input deltas, reasoning
 * blocks). In-stream exception events map to a readable `error` event.
 */
export async function* adaptInvokeStream(
  stream: AsyncIterable<unknown>
): AsyncGenerator<StreamEvent> {
  // Map contentBlockIndex → toolUseId so tool-input deltas (which carry only an
  // index) attach to the right tool. A block index is reused per message.
  const toolByIndex = new Map<number, string>();
  // Tool-RESULT block start carries {toolUseId, status} but no content; the
  // content arrives in later deltas (an array of {text}|{json}) that carry only
  // the block index. Track the result's identity by index so deltas attach.
  const resultByIndex = new Map<number, { toolUseId?: string; status?: string }>();

  let textDeltas = 0;
  let toolInputDeltas = 0;
  let toolResultDeltas = 0;
  let toolResultBytes = 0;
  let loggedResultSample = false;
  for await (const event of stream) {
    debugStructuralEvent(event);
    if (isRecord(event)) {
      const noisy = noisyDeltaKind(event);
      if (noisy === 'text') textDeltas++;
      else if (noisy === 'toolInput') toolInputDeltas++;
      else if (noisy === 'toolResult') {
        toolResultDeltas++;
        const d = isRecord(event.contentBlockDelta)
          ? event.contentBlockDelta.delta
          : undefined;
        const frag = isRecord(d) ? flattenToolResultDelta(d.toolResult) : '';
        toolResultBytes += frag.length;
        // Log ONE short sample so the result shape is visible without flooding.
        if (STREAM_DEBUG && !loggedResultSample && frag.length > 0) {
          loggedResultSample = true;
          console.debug(
            `[invoke] tool-result sample (first ~200 chars): ${frag.slice(0, 200)}`
          );
        }
      }
    }
    if (!isRecord(event)) continue;

    if (isRecord(event.contentBlockStart)) {
      const cbs = event.contentBlockStart;
      const start = isRecord(cbs.start) ? cbs.start : undefined;
      const toolUse =
        start && isRecord(start.toolUse) ? start.toolUse : undefined;
      if (toolUse && typeof toolUse.toolUseId === 'string') {
        if (typeof cbs.contentBlockIndex === 'number') {
          toolByIndex.set(cbs.contentBlockIndex, toolUse.toolUseId);
        }
        yield {
          type: 'tool-start',
          toolUseId: toolUse.toolUseId,
          name: typeof toolUse.name === 'string' ? toolUse.name : 'tool',
        };
        continue;
      }
      // Tool-result block start: record {toolUseId, status} by index. Content
      // follows in deltas (SDK: HarnessToolResultBlockStart has no content).
      if (start && isRecord(start.toolResult)) {
        const tr = start.toolResult;
        if (typeof cbs.contentBlockIndex === 'number') {
          resultByIndex.set(cbs.contentBlockIndex, {
            toolUseId: typeof tr.toolUseId === 'string' ? tr.toolUseId : undefined,
            status: typeof tr.status === 'string' ? tr.status : undefined,
          });
        }
      }
      continue;
    }

    if (isRecord(event.contentBlockDelta)) {
      const cbd = event.contentBlockDelta;
      const delta = isRecord(cbd.delta) ? cbd.delta : undefined;
      if (!delta) continue;
      if (typeof delta.text === 'string' && delta.text.length > 0) {
        yield { type: 'text-delta', text: delta.text };
        continue;
      }
      if (isRecord(delta.toolUse) && typeof delta.toolUse.input === 'string') {
        const idx =
          typeof cbd.contentBlockIndex === 'number'
            ? cbd.contentBlockIndex
            : undefined;
        yield {
          type: 'tool-input-delta',
          toolUseId: (idx !== undefined && toolByIndex.get(idx)) || '',
          input: delta.toolUse.input,
        };
        continue;
      }
      // Tool-result content delta: an ARRAY of {text}|{json} (SDK verified). The
      // toolUseId/status came from the block start, keyed by index.
      if (delta.toolResult !== undefined) {
        const idx =
          typeof cbd.contentBlockIndex === 'number'
            ? cbd.contentBlockIndex
            : undefined;
        const meta = idx !== undefined ? resultByIndex.get(idx) : undefined;
        yield {
          type: 'tool-result',
          toolUseId: meta?.toolUseId,
          content: flattenToolResultDelta(delta.toolResult),
          status: meta?.status,
        };
        continue;
      }
      // reasoningContent deltas: skip (not rendered as text).
      continue;
    }

    if (isRecord(event.contentBlockStop)) {
      const idx = event.contentBlockStop.contentBlockIndex;
      const toolUseId =
        typeof idx === 'number' ? toolByIndex.get(idx) : undefined;
      yield { type: 'tool-stop', toolUseId };
      continue;
    }

    if (isRecord(event.messageStop)) {
      yield {
        type: 'stop',
        stopReason:
          typeof event.messageStop.stopReason === 'string'
            ? event.messageStop.stopReason
            : 'unknown',
      };
      continue;
    }

    if (isRecord(event.metadata)) {
      const usage = isRecord(event.metadata.usage)
        ? event.metadata.usage
        : undefined;
      const metrics = isRecord(event.metadata.metrics)
        ? event.metadata.metrics
        : undefined;
      yield {
        type: 'usage',
        usage: {
          inputTokens: num(usage?.inputTokens),
          outputTokens: num(usage?.outputTokens),
          totalTokens: num(usage?.totalTokens),
          cacheReadInputTokens: num(usage?.cacheReadInputTokens),
          cacheWriteInputTokens: num(usage?.cacheWriteInputTokens),
        },
        latencyMs: num(metrics?.latencyMs),
      };
      continue;
    }

    // In-stream exception events.
    for (const key of [
      'validationException',
      'internalServerException',
      'runtimeClientError',
    ] as const) {
      if (isRecord(event[key])) {
        const ex = event[key] as Record<string, unknown>;
        yield {
          type: 'error',
          code: key,
          message:
            typeof ex.message === 'string'
              ? ex.message
              : 'The harness stream reported an error.',
        };
        return;
      }
    }

    // messageStart / unknown: ignore.
    if (process.env.NODE_ENV === 'development') {
      const known =
        'contentBlockStart' in event ||
        'contentBlockDelta' in event ||
        'contentBlockStop' in event ||
        'messageStop' in event ||
        'metadata' in event ||
        'messageStart' in event;
      if (!known) {
        console.debug('[invoke] skipping unknown stream event:', Object.keys(event));
      }
    }
  }

  if (STREAM_DEBUG) {
    console.debug(
      `[invoke] stream end — summarized ${textDeltas} text delta(s), ` +
        `${toolInputDeltas} tool-input delta(s), ${toolResultDeltas} ` +
        `tool-result delta(s) (${toolResultBytes} chars total)`
    );
  }
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Send InvokeHarness and return the raw stream (or throw a mapped error). */
export async function invokeHarness(
  req: InvokeHarnessCommandInput,
  opts: { region?: string; abortSignal?: AbortSignal }
): Promise<AsyncIterable<unknown>> {
  const { data } = clientsFor(opts.region);
  const response = await data.send(new InvokeHarnessCommand(req), {
    abortSignal: opts.abortSignal,
  });
  return (response.stream ?? []) as AsyncIterable<unknown>;
}
