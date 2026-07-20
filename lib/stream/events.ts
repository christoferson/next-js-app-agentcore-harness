// The ONLY vocabulary the client understands (SPEC §3, CLAUDE.md §4). Shared
// between server (stream adapters) and client (chat/command hooks). No imports —
// this module is safe to bundle in the browser.
//
// Client code MUST ignore unknown event types for forward compatibility
// (CLAUDE.md §4).

export interface StreamUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
}

export type StreamEvent =
  // ── chat (InvokeHarness) ──────────────────────────────────────────────
  | { type: 'text-delta'; text: string }
  | { type: 'tool-start'; toolUseId: string; name: string }
  | { type: 'tool-input-delta'; toolUseId: string; input: string }
  | { type: 'tool-stop'; toolUseId?: string }
  // Tool result (e.g. web-search sources). Shape verified against SDK types
  // (HarnessContentBlockStart.ToolResultMember carries {toolUseId, status};
  // content streams as HarnessToolResultBlockDelta[] of {text}|{json}). The
  // adapter attaches id/status from the block start and flattens delta content.
  | { type: 'tool-result'; toolUseId?: string; content: string; status?: string }
  | { type: 'usage'; usage: StreamUsage; latencyMs?: number }
  | { type: 'stop'; stopReason: string }
  // ── command (InvokeAgentRuntimeCommand) ───────────────────────────────
  | { type: 'stdout'; text: string }
  | { type: 'stderr'; text: string }
  | { type: 'exit-code'; code: number }
  // ── shared ────────────────────────────────────────────────────────────
  | { type: 'error'; code: string; message: string };

export type StreamEventType = StreamEvent['type'];

const encoder = new TextEncoder();

/** Encode one event as an SSE `data:` frame. */
export function encodeSse(event: StreamEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
} as const;

/**
 * Parse SSE frames out of a streamed text buffer. Returns the events found and
 * the remaining unparsed tail. Unknown `type` values are still returned (typed
 * as StreamEvent); the consumer decides to ignore them.
 */
export function parseSseChunk(buffer: string): {
  events: StreamEvent[];
  rest: string;
} {
  const events: StreamEvent[] = [];
  const frames = buffer.split('\n\n');
  const rest = frames.pop() ?? '';
  for (const frame of frames) {
    const line = frame.split('\n').find((l) => l.startsWith('data:'));
    if (!line) continue;
    const json = line.slice(5).trim();
    if (!json) continue;
    try {
      events.push(JSON.parse(json) as StreamEvent);
    } catch {
      // Malformed frame — skip, never crash (SPEC §1 defensive parsing).
    }
  }
  return { events, rest };
}
