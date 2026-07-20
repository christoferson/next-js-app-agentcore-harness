"use client";

import { useCallback, useRef, useState } from "react";
import type { StreamEvent, StreamUsage } from "@/lib/stream/events";
import type { Overrides } from "./types";
import { streamSse } from "./sse";

export interface ToolRecord {
  toolUseId: string;
  name: string;
  input: string;
  done: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: ToolRecord[];
  usage?: StreamUsage;
  latencyMs?: number;
  stopReason?: string;
  error?: string;
  streaming?: boolean;
}

export interface SendArgs {
  harnessArn: string;
  sessionId: string;
  actorId: string;
  overrides: Overrides;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `m${idCounter}`;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Ref-buffered assistant text, flushed on animation frame to avoid a
  // per-token re-render of the whole list (CLAUDE.md §6).
  const bufferRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const lastToolRef = useRef<string | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    const id = activeIdRef.current;
    if (!id) return;
    const text = bufferRef.current;
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, text } : m))
    );
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(flush);
  }, [flush]);

  const patchActive = useCallback(
    (patch: (m: ChatMessage) => ChatMessage) => {
      const id = activeIdRef.current;
      if (!id) return;
      setMessages((prev) => prev.map((m) => (m.id === id ? patch(m) : m)));
    },
    []
  );

  const handleEvent = useCallback(
    (e: StreamEvent) => {
      switch (e.type) {
        case "text-delta":
          bufferRef.current += e.text;
          scheduleFlush();
          break;
        case "tool-start":
          lastToolRef.current = e.toolUseId;
          patchActive((m) => ({
            ...m,
            tools: [
              ...m.tools,
              { toolUseId: e.toolUseId, name: e.name, input: "", done: false },
            ],
          }));
          break;
        case "tool-input-delta": {
          const targetId = e.toolUseId || lastToolRef.current;
          patchActive((m) => ({
            ...m,
            tools: m.tools.map((t) =>
              t.toolUseId === targetId ? { ...t, input: t.input + e.input } : t
            ),
          }));
          break;
        }
        case "tool-stop":
          patchActive((m) => ({
            ...m,
            tools: m.tools.map((t) =>
              e.toolUseId
                ? t.toolUseId === e.toolUseId
                  ? { ...t, done: true }
                  : t
                : { ...t, done: true }
            ),
          }));
          break;
        case "usage":
          patchActive((m) => ({
            ...m,
            usage: e.usage,
            latencyMs: e.latencyMs,
          }));
          break;
        case "stop":
          patchActive((m) => ({ ...m, stopReason: e.stopReason }));
          break;
        case "error":
          patchActive((m) => ({
            ...m,
            error: `${e.code}: ${e.message}`,
          }));
          break;
        default:
          // Unknown event type — ignore (forward compatibility, CLAUDE.md §4).
          break;
      }
    },
    [patchActive, scheduleFlush]
  );

  const send = useCallback(
    async (prompt: string, args: SendArgs) => {
      if (streaming) return;
      const userMsg: ChatMessage = {
        id: nextId(),
        role: "user",
        text: prompt,
        tools: [],
      };
      const assistantId = nextId();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        text: "",
        tools: [],
        streaming: true,
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      activeIdRef.current = assistantId;
      bufferRef.current = "";
      lastToolRef.current = null;
      setStreaming(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        await streamSse(
          "/api/chat",
          {
            harnessArn: args.harnessArn,
            sessionId: args.sessionId,
            actorId: args.actorId,
            prompt,
            overrides: cleanOverrides(args.overrides),
          },
          handleEvent,
          ctrl.signal
        );
      } catch (err) {
        handleEvent({
          type: "error",
          code: "StreamError",
          message: (err as Error)?.message ?? "Stream failed.",
        });
      } finally {
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        // Final flush of any buffered text.
        const finalText = bufferRef.current;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, text: finalText, streaming: false }
              : m
          )
        );
        activeIdRef.current = null;
        abortRef.current = null;
        setStreaming(false);
      }
    },
    [streaming, handleEvent]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
  }, []);

  /** Rebuild chat history from resumed session events (SPEC §5.3 resume). */
  const loadHistory = useCallback((msgs: ChatMessage[]) => {
    abortRef.current?.abort();
    setMessages(msgs);
  }, []);

  return { messages, streaming, send, stop, reset, loadHistory };
}

function cleanOverrides(o: Overrides): Overrides {
  const out: Overrides = {};
  if (o.modelId) out.modelId = o.modelId;
  if (typeof o.temperature === "number") out.temperature = o.temperature;
  if (typeof o.maxTokens === "number") out.maxTokens = o.maxTokens;
  if (o.systemPrompt && o.systemPrompt.trim()) out.systemPrompt = o.systemPrompt;
  return out;
}
