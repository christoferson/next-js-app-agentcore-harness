"use client";

import { useState } from "react";
import {
  ChevronRightIcon,
  ExternalLinkIcon,
  Loader2Icon,
  WrenchIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolRecord } from "@/lib/client/use-chat";
import { extractSources, sourceLabel } from "@/lib/client/sources";

// Live tool-call preview: pretty-print accumulated JSON input when parseable,
// otherwise truncate raw at ~120 chars (SPEC §6, CLAUDE.md §6).
export function previewInput(input: string): { text: string; pretty: boolean } {
  const trimmed = input.trim();
  if (!trimmed) return { text: "", pretty: false };
  try {
    return { text: JSON.stringify(JSON.parse(trimmed), null, 2), pretty: true };
  } catch {
    return {
      text: trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed,
      pretty: false,
    };
  }
}

/** Clickable citation list rendered from a tool result's sources. */
function SourcesList({ content }: { content: string }) {
  const sources = extractSources(content);
  if (sources.length === 0) return null;
  return (
    <div className="border-t border-border px-2.5 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Sources ({sources.length})
      </span>
      <ul className="mt-1 flex flex-col gap-1">
        {sources.map((s, i) => (
          <li key={`${s.url}-${i}`} className="flex items-start gap-1.5 text-xs">
            <ExternalLinkIcon className="mt-0.5 size-3 shrink-0 text-blue-400" />
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 break-words text-blue-400 hover:text-blue-300 hover:underline"
              title={s.url}
            >
              {sourceLabel(s)}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Collapsed tool chip attached to a settled message. */
function ToolChip({ tool }: { tool: ToolRecord }) {
  const [expanded, setExpanded] = useState(false);
  const { text } = previewInput(tool.input);
  const hasResult = Boolean(tool.result && tool.result.trim());
  return (
    <div className="rounded-lg border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs"
      >
        <ChevronRightIcon
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-90"
          )}
        />
        <WrenchIcon className="size-3 shrink-0 text-blue-400" />
        <span className="font-medium">{tool.name}</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {tool.toolUseId.slice(0, 8)}
        </span>
      </button>
      {expanded && (
        <>
          {text && (
            <pre className="overflow-x-auto border-t border-border bg-black/30 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-slate-300">
              {text}
            </pre>
          )}
          {hasResult && <SourcesList content={tool.result!} />}
          {hasResult && extractSources(tool.result!).length === 0 && (
            <pre className="overflow-x-auto border-t border-border bg-black/30 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-slate-300">
              {tool.result}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

/** Live activity row shown while a tool is in-flight. */
function ToolLive({ tool }: { tool: ToolRecord }) {
  const { text } = previewInput(tool.input);
  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs">
        <Loader2Icon className="size-3 shrink-0 animate-spin text-blue-400" />
        <span className="text-muted-foreground">Calling</span>
        <span className="font-medium text-blue-300">{tool.name}</span>
      </div>
      {text && (
        <pre className="overflow-x-auto border-t border-blue-500/20 bg-black/30 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-slate-300">
          {text}
        </pre>
      )}
    </div>
  );
}

export function ToolActivity({
  tools,
  streaming,
}: {
  tools: ToolRecord[];
  streaming?: boolean;
}) {
  if (tools.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {tools.map((t) =>
        streaming && !t.done ? (
          <ToolLive key={t.toolUseId} tool={t} />
        ) : (
          <ToolChip key={t.toolUseId} tool={t} />
        )
      )}
    </div>
  );
}
