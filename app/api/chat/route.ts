import { z } from 'zod';
import { defaultRegion, mapAwsError } from '@/lib/agentcore/clients';
import {
  adaptInvokeStream,
  buildInvokeRequest,
  invokeHarness,
  redactInvokeParams,
} from '@/lib/agentcore/invoke';
import { getModelConfig, validateOverrides } from '@/lib/models/validate';
import { encodeSse, SSE_HEADERS, type StreamEvent } from '@/lib/stream/events';
import { metricsSink } from '@/lib/metrics/metrics-sink';

export const runtime = 'nodejs';

const bodySchema = z.object({
  harnessArn: z.string().min(1),
  sessionId: z.string().min(1),
  actorId: z.string().min(1),
  prompt: z.string().min(1),
  overrides: z.record(z.string(), z.unknown()).optional(),
});

function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

/** POST /api/chat (SSE) — InvokeHarness (SPEC §5.2). */
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(400, 'InvalidJSON', 'Request body must be JSON.');
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      400,
      'InvalidRequest',
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    );
  }
  const { harnessArn, sessionId, actorId, prompt, overrides } = parsed.data;

  // Resolve the effective model to gate temperature (registry-driven, §4.2).
  const overrideModelId =
    overrides && typeof overrides.modelId === 'string'
      ? overrides.modelId
      : undefined;
  const effectiveModel = overrideModelId
    ? getModelConfig(overrideModelId)
    : undefined;

  if (overrideModelId && !effectiveModel) {
    return jsonError(400, 'UnknownModel', `Unknown modelId: ${overrideModelId}`);
  }

  const validated = validateOverrides(overrides, effectiveModel);
  if (!validated.ok) {
    return jsonError(400, 'InvalidOverrides', validated.error!);
  }

  const req = buildInvokeRequest({
    harnessArn,
    runtimeSessionId: sessionId,
    actorId,
    prompt,
    overrides: validated.overrides!,
    model: effectiveModel,
  });

  if (process.env.NODE_ENV === 'development') {
    // Verifiable: unset overrides send no fields (SPEC §10, CLAUDE.md §4).
    console.debug('[chat] InvokeHarness params:', JSON.stringify(redactInvokeParams(req)));
  }

  const region = defaultRegion();
  let awsStream: AsyncIterable<unknown>;
  try {
    awsStream = await invokeHarness(req, {
      region,
      abortSignal: request.signal,
    });
  } catch (err) {
    const mapped = mapAwsError(err);
    return jsonError(502, mapped.code, mapped.message);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: StreamEvent) => {
        try {
          controller.enqueue(encodeSse(e));
        } catch {
          /* controller closed */
        }
      };
      try {
        for await (const event of adaptInvokeStream(awsStream)) {
          send(event);
          if (event.type === 'usage') {
            metricsSink.record({
              userId: actorId,
              modelId: overrideModelId ?? 'harness-default',
              inputTokens: event.usage.inputTokens,
              outputTokens: event.usage.outputTokens,
              totalTokens: event.usage.totalTokens,
              cacheReadInputTokens: event.usage.cacheReadInputTokens,
              cacheWriteInputTokens: event.usage.cacheWriteInputTokens,
              latencyMs: event.latencyMs,
            });
          }
        }
      } catch (err) {
        if ((err as { name?: string })?.name !== 'AbortError') {
          const mapped = mapAwsError(err);
          send({ type: 'error', code: mapped.code, message: mapped.message });
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
