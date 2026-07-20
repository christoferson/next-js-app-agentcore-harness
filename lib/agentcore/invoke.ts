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

  for await (const event of stream) {
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
      // reasoningContent / toolResult deltas: skip (not rendered as text).
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
