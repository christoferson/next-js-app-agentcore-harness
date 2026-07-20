import { z } from 'zod';
import { defaultRegion, mapAwsError } from '@/lib/agentcore/clients';
import {
  adaptCommandStream,
  buildCommandRequest,
  invokeCommand,
} from '@/lib/agentcore/command';
import { encodeSse, SSE_HEADERS, type StreamEvent } from '@/lib/stream/events';

export const runtime = 'nodejs';

const bodySchema = z.object({
  // The command target. For harness-managed runtimes the service rejects the
  // underlying runtime ARN and requires the harness identity here (see
  // aws/docs/_manifest.md divergence #2), so the client sends the harness ARN.
  commandTarget: z.string().min(1),
  sessionId: z.string().min(1),
  command: z.string().min(1),
});

function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

/** POST /api/command (SSE) — InvokeAgentRuntimeCommand (SPEC §5.5). */
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
  const { commandTarget, sessionId, command } = parsed.data;

  const req = buildCommandRequest({
    agentRuntimeArn: commandTarget,
    runtimeSessionId: sessionId,
    command,
  });

  const region = defaultRegion();
  let awsStream: AsyncIterable<unknown>;
  try {
    awsStream = await invokeCommand(req, { region, abortSignal: request.signal });
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
          /* closed */
        }
      };
      try {
        for await (const event of adaptCommandStream(awsStream, () => {})) {
          send(event);
        }
      } catch (err) {
        if ((err as { name?: string })?.name !== 'AbortError') {
          const mapped = mapAwsError(err);
          send({ type: 'error', code: mapped.code, message: mapped.message });
          // Ensure the terminal has an exit indicator even on error.
          send({ type: 'exit-code', code: -1 });
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
