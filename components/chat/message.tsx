"use client";

import { useEffect, useState } from "react";
import { BotIcon, AlertTriangleIcon, Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/client/use-chat";
import { Markdown } from "@/components/common/markdown";
import { ToolActivity } from "./tool-activity";

/** Format elapsed ms as compact "1.2s" / "1m 05s". */
function fmtElapsed(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  return `${m}m ${String(rem).padStart(2, "0")}s`;
}

/**
 * Streaming status indicator — visible for the WHOLE in-flight turn, including
 * during tool use (the previous pulse cursors hid themselves then). Shows a
 * context-aware label and a live elapsed timer.
 */
function StreamingIndicator({ m }: { m: ChatMessage }) {
  // The indicator only mounts while streaming, so mount ≈ turn start.
  const [start] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - start), 100);
    return () => clearInterval(id);
  }, [start]);

  const activeTool = m.tools.find((t) => !t.done);
  const label = activeTool
    ? `Using ${activeTool.name}…`
    : m.text
      ? "Responding…"
      : "Thinking…";

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2Icon className="size-3.5 animate-spin text-violet-400" />
      <span>{label}</span>
      <span className="font-mono tabular-nums text-violet-400/80">
        {fmtElapsed(elapsed)}
      </span>
    </div>
  );
}

function UsageFooter({ m }: { m: ChatMessage }) {
  const u = m.usage;
  const showStop = m.stopReason && m.stopReason !== "end_turn";
  if (!u && !showStop && !m.latencyMs) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground tabular-nums">
      {u?.inputTokens != null && <span>in {u.inputTokens}</span>}
      {u?.outputTokens != null && <span>out {u.outputTokens}</span>}
      {u?.totalTokens != null && (
        <span className="font-medium">total {u.totalTokens}</span>
      )}
      {(u?.cacheReadInputTokens ?? 0) > 0 && (
        <span className="text-emerald-500">cache-read {u!.cacheReadInputTokens}</span>
      )}
      {m.latencyMs != null && <span>{m.latencyMs}ms</span>}
      {showStop && (
        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-400">
          stop: {m.stopReason}
        </span>
      )}
    </div>
  );
}

export function MessageBubble({ m }: { m: ChatMessage }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
          {m.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-violet-400">
        <BotIcon className="size-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {m.tools.length > 0 && (
          <ToolActivity tools={m.tools} streaming={m.streaming} />
        )}
        {m.text && <Markdown text={m.text} />}
        {m.streaming && <StreamingIndicator m={m} />}
        {m.error && (
          <div className="flex items-start gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-xs text-red-400">
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
            <span className="whitespace-pre-wrap">{m.error}</span>
          </div>
        )}
        <UsageFooter m={m} />
      </div>
    </div>
  );
}

export { cn };
