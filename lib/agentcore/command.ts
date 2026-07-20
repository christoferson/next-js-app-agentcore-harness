import 'server-only';
import {
  InvokeAgentRuntimeCommandCommand,
  type InvokeAgentRuntimeCommandCommandInput,
} from '@aws-sdk/client-bedrock-agentcore';
import { clientsFor } from './clients';
import type { StreamEvent } from '@/lib/stream/events';

// Run Command adapter (SPEC §5.5). Targets `agentRuntimeArn` (resolved from
// GetHarness → environment.agentCoreRuntimeEnvironment.agentRuntimeArn), NOT the
// harness ARN — see aws/docs/_manifest.md divergence #2.

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function buildCommandRequest(params: {
  agentRuntimeArn: string;
  runtimeSessionId: string;
  command: string;
}): InvokeAgentRuntimeCommandCommandInput {
  return {
    agentRuntimeArn: params.agentRuntimeArn,
    runtimeSessionId: params.runtimeSessionId,
    body: { command: params.command },
  };
}

export async function invokeCommand(
  req: InvokeAgentRuntimeCommandCommandInput,
  opts: { region?: string; abortSignal?: AbortSignal }
): Promise<AsyncIterable<unknown>> {
  const { data } = clientsFor(opts.region);
  const response = await data.send(new InvokeAgentRuntimeCommandCommand(req), {
    abortSignal: opts.abortSignal,
  });
  return (response.stream ?? []) as AsyncIterable<unknown>;
}

/**
 * Defensive adapter: command stream → StreamEvent (SPEC §5.5).
 * `chunk.contentDelta.{stdout,stderr}` → stdout/stderr; `chunk.contentStop.exitCode`
 * → exit-code. If `contentStop` never arrives, the caller emits exit-code -1 on
 * stream end (CLAUDE.md §3). Returns true if an exit code was seen.
 */
export async function* adaptCommandStream(
  stream: AsyncIterable<unknown>,
  onExit: () => void
): AsyncGenerator<StreamEvent> {
  let sawExit = false;
  for await (const event of stream) {
    if (!isRecord(event)) continue;
    const chunk = isRecord(event.chunk) ? event.chunk : undefined;
    if (!chunk) continue;

    if (isRecord(chunk.contentDelta)) {
      const d = chunk.contentDelta;
      if (typeof d.stdout === 'string' && d.stdout.length > 0) {
        yield { type: 'stdout', text: d.stdout };
      }
      if (typeof d.stderr === 'string' && d.stderr.length > 0) {
        yield { type: 'stderr', text: d.stderr };
      }
      continue;
    }
    if (isRecord(chunk.contentStop)) {
      const code =
        typeof chunk.contentStop.exitCode === 'number'
          ? chunk.contentStop.exitCode
          : 0;
      sawExit = true;
      yield { type: 'exit-code', code };
      continue;
    }
    // contentStart / unknown: ignore.
  }
  if (!sawExit) {
    onExit();
    yield { type: 'exit-code', code: -1 };
  }
}
