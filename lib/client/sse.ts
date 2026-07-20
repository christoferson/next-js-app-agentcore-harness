"use client";

import { parseSseChunk, type StreamEvent } from "@/lib/stream/events";

/**
 * POST a JSON body and consume the SSE response, invoking `onEvent` for each
 * parsed StreamEvent. Rejects on network/HTTP error (the body may also be a
 * JSON error envelope from the route handler when it fails before streaming).
 * Aborting via `signal` resolves quietly.
 */
export async function streamSse(
  url: string,
  body: unknown,
  onEvent: (e: StreamEvent) => void,
  signal: AbortSignal
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !contentType.includes("text/event-stream")) {
    // Route handler returned a JSON error before streaming started.
    const errBody = await res.json().catch(() => null);
    const err = errBody?.error ?? {
      code: "HttpError",
      message: `Request failed (${res.status}).`,
    };
    onEvent({ type: "error", code: err.code, message: err.message });
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSseChunk(buffer);
      buffer = rest;
      for (const e of events) onEvent(e);
    }
  } catch (err) {
    if ((err as { name?: string })?.name !== "AbortError") throw err;
  }
}
