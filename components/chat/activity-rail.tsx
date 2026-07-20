"use client";

import { useMemo, useState } from "react";
import {
  ActivityIcon,
  ChevronRightIcon,
  ChevronsRightIcon,
  Loader2Icon,
  WrenchIcon,
} from "lucide-react";
import type { ChatMessage, ToolRecord } from "@/lib/client/use-chat";
import { Button } from "@/components/ui/button";
import { previewInput } from "./tool-activity";
import { cn } from "@/lib/utils";

// Right-flank inspector rail (wide screens only). Aggregates and re-presents
// per-message tool activity + usage that useChat already exposes — no new data
// plumbing. Inline chips stay in the message list; this is the persistent view.

interface RailStats {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheRead: number;
  cacheWrite: number;
  lastLatencyMs?: number;
  toolCalls: number;
}

function computeStats(messages: ChatMessage[]): RailStats {
  const s: RailStats = {
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheRead: 0,
    cacheWrite: 0,
    toolCalls: 0,
  };
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    s.turns += 1;
    s.toolCalls += m.tools.length;
    if (m.usage) {
      s.inputTokens += m.usage.inputTokens ?? 0;
      s.outputTokens += m.usage.outputTokens ?? 0;
      s.totalTokens += m.usage.totalTokens ?? 0;
      s.cacheRead += m.usage.cacheReadInputTokens ?? 0;
      s.cacheWrite += m.usage.cacheWriteInputTokens ?? 0;
    }
    if (m.latencyMs != null) s.lastLatencyMs = m.latencyMs;
  }
  return s;
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={cnAccent(accent)}
      >
        {value}
      </span>
    </div>
  );
}

function cnAccent(accent?: boolean): string {
  return accent
    ? "font-mono text-sm font-semibold tabular-nums text-violet-400"
    : "font-mono text-sm tabular-nums text-foreground";
}

/**
 * Expandable tool row for the persistent log. Uses the same previewInput() as
 * the main panel's chip so the input shown here matches the message list.
 */
function ToolLogRow({ tool }: { tool: ToolRecord }) {
  const [expanded, setExpanded] = useState(false);
  const { text } = previewInput(tool.input);
  return (
    <div className="overflow-hidden rounded-md border border-border/70 bg-muted/20">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs hover:bg-muted/40"
      >
        <ChevronRightIcon
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-90"
          )}
        />
        <WrenchIcon className="size-3 shrink-0 text-blue-400" />
        <span className="truncate font-medium">{tool.name}</span>
        {!tool.done && (
          <Loader2Icon className="size-3 shrink-0 animate-spin text-blue-400" />
        )}
        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
          {tool.toolUseId.slice(0, 8)}
        </span>
      </button>
      {expanded &&
        (text ? (
          <pre className="max-h-48 overflow-auto border-t border-border bg-black/30 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-slate-300">
            {text}
          </pre>
        ) : (
          <p className="border-t border-border px-2 py-1.5 text-[11px] italic text-muted-foreground">
            No input.
          </p>
        ))}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

export function ActivityRail({
  messages,
  streaming,
  onCollapse,
}: {
  messages: ChatMessage[];
  streaming: boolean;
  onCollapse: () => void;
}) {
  const stats = useMemo(() => computeStats(messages), [messages]);

  // Live tools = tools on the currently-streaming assistant message.
  const liveTools = useMemo(() => {
    if (!streaming) return [];
    const active = [...messages].reverse().find((m) => m.streaming);
    return active ? active.tools.filter((t) => !t.done) : [];
  }, [messages, streaming]);

  // Full tool log, newest-first across the session.
  const toolLog = useMemo(() => {
    const all: ToolRecord[] = [];
    for (const m of messages) {
      if (m.role === "assistant") all.push(...m.tools);
    }
    return all.reverse();
  }, [messages]);

  return (
    <aside className="hidden w-80 shrink-0 flex-col border-l border-border bg-card/30 xl:flex">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <ActivityIcon className="size-4 text-violet-400" />
        <span className="text-sm font-semibold">Activity &amp; Stats</span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-6"
          onClick={onCollapse}
          title="Collapse panel"
        >
          <ChevronsRightIcon className="size-4" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
        {/* Session stats */}
        <section className="flex flex-col gap-2">
          <SectionHeader>Session</SectionHeader>
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Turns" value={stats.turns} />
            <StatTile label="Tool calls" value={stats.toolCalls} />
            <StatTile label="Total tokens" value={stats.totalTokens} accent />
            <StatTile
              label="Last latency"
              value={stats.lastLatencyMs != null ? `${stats.lastLatencyMs}ms` : "—"}
            />
            <StatTile label="Input" value={stats.inputTokens} />
            <StatTile label="Output" value={stats.outputTokens} />
            {(stats.cacheRead > 0 || stats.cacheWrite > 0) && (
              <>
                <StatTile label="Cache read" value={stats.cacheRead} />
                <StatTile label="Cache write" value={stats.cacheWrite} />
              </>
            )}
          </div>
        </section>

        {/* Live tool activity */}
        {liveTools.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionHeader>Live</SectionHeader>
            {liveTools.map((t) => (
              <div
                key={t.toolUseId}
                className="rounded-lg border border-blue-500/30 bg-blue-500/5 px-2.5 py-1.5 text-xs"
              >
                <div className="flex items-center gap-1.5">
                  <Loader2Icon className="size-3 shrink-0 animate-spin text-blue-400" />
                  <span className="text-muted-foreground">Calling</span>
                  <span className="font-medium text-blue-300">{t.name}</span>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Recent tools log */}
        <section className="flex min-h-0 flex-1 flex-col gap-2">
          <SectionHeader>Tools ({toolLog.length})</SectionHeader>
          {toolLog.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No tool calls yet. Tool use for each turn appears here.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {toolLog.map((t, i) => (
                <ToolLogRow key={t.toolUseId || i} tool={t} />
              ))}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
