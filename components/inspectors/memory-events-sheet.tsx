"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  Loader2,
  RefreshCw,
  Wrench,
  CornerDownRight,
  ExternalLink,
} from "lucide-react";
import type { ParsedEvent, ToolBlock } from "@/lib/client/types";
import { extractSources, sourceLabel } from "@/lib/client/sources";
import { getJson, qs, ApiRequestError } from "@/lib/client/api";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/common/copy-button";
import { cn } from "@/lib/utils";

interface MemoryEventsSheetProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  memoryId: string;
  sessionId: string;
  actorId: string;
}

interface EventsResponse {
  events: ParsedEvent[];
  nextToken?: string;
}

const ROLE_ICON: Record<string, string> = {
  USER: "👤",
  ASSISTANT: "🤖",
  TOOL: "🔧",
  BLOB: "📦",
};

function roleKey(e: ParsedEvent): string {
  if (e.type === "blob") return "BLOB";
  const r = (e.role ?? "").toUpperCase();
  if (r === "USER" || r === "ASSISTANT" || r === "TOOL") return r;
  return "UNKNOWN";
}

function roleIcon(key: string): string {
  return ROLE_ICON[key] ?? "❓";
}

function isKnownRole(e: ParsedEvent): boolean {
  if (e.type === "unknown") return false;
  const key = roleKey(e);
  return key === "USER" || key === "ASSISTANT" || key === "TOOL";
}

function formatTs(ts?: string): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

function prettyInput(input: unknown): string | null {
  if (input === undefined || input === null) return null;
  if (typeof input === "string") {
    const s = input.trim();
    if (!s) return null;
    try {
      return JSON.stringify(JSON.parse(s), null, 2);
    } catch {
      return s;
    }
  }
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

/** One tool-use / tool-result block, rendered as an expandable chip. */
function ToolBlockChip({ tool }: { tool: ToolBlock }) {
  const [open, setOpen] = useState(false);
  const isUse = tool.kind === "use";
  const body = isUse ? prettyInput(tool.input) : tool.content?.trim() || null;
  const label = isUse ? tool.name ?? "tool" : tool.name ?? "result";
  const isError = tool.status?.toLowerCase() === "error";
  const sources = !isUse && tool.content ? extractSources(tool.content) : [];

  return (
    <div className="overflow-hidden rounded-md border border-border/70 bg-muted/30">
      <button
        type="button"
        onClick={() => body && setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs",
          body && "hover:bg-muted/60"
        )}
      >
        {isUse ? (
          <Wrench className="size-3 shrink-0 text-sky-400" />
        ) : (
          <CornerDownRight
            className={cn(
              "size-3 shrink-0",
              isError ? "text-red-400" : "text-emerald-400"
            )}
          />
        )}
        <span className="font-medium text-foreground">{label}</span>
        <span className="rounded bg-background/60 px-1 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
          {isUse ? "call" : isError ? "error" : "result"}
        </span>
        {body && (
          <ChevronDown
            className={cn(
              "ml-auto size-3 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        )}
      </button>
      {open && sources.length > 0 && (
        <div className="border-t border-border/70 bg-background/40 px-2 py-1.5">
          <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Sources ({sources.length})
          </span>
          <ul className="mt-1 flex flex-col gap-1">
            {sources.map((s, i) => (
              <li key={`${s.url}-${i}`} className="flex items-start gap-1.5 text-xs">
                <ExternalLink className="mt-0.5 size-3 shrink-0 text-sky-400" />
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 break-words text-sky-400 hover:text-sky-300 hover:underline"
                  title={s.url}
                >
                  {sourceLabel(s)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {open && body && sources.length === 0 && (
        <pre className="max-h-48 overflow-auto border-t border-border/70 bg-background/40 px-2 py-1.5 font-mono text-[0.7rem] whitespace-pre-wrap break-words">
          {body}
        </pre>
      )}
    </div>
  );
}

export function MemoryEventsSheet({
  open,
  onOpenChange,
  memoryId,
  sessionId,
  actorId,
}: MemoryEventsSheetProps) {
  const [includePayloads, setIncludePayloads] = useState(true);
  const [skipUnknownRole, setSkipUnknownRole] = useState(false);
  const [maxResults, setMaxResults] = useState(50);

  const [events, setEvents] = useState<ParsedEvent[]>([]);
  const [nextToken, setNextToken] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchPage = useCallback(
    async (append: boolean, token?: string) => {
      if (!memoryId || !sessionId || !actorId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await getJson<EventsResponse>(
          "/api/memory/events" +
            qs({
              memoryId,
              sessionId,
              actorId,
              maxResults,
              includePayloads: includePayloads ? "true" : "false",
              nextToken: token,
            })
        );
        setNextToken(res.nextToken);
        setEvents((prev) => (append ? [...prev, ...res.events] : res.events));
        if (!append) {
          // Expand the first (newest) card by default.
          const newest = res.events[res.events.length - 1];
          setExpanded(newest ? new Set([newest.eventId]) : new Set());
        }
      } catch (err) {
        if (err instanceof ApiRequestError) setError(err.message);
        else if (err instanceof Error) setError(err.message);
        else setError("Failed to load memory events.");
      } finally {
        setLoading(false);
      }
    },
    [memoryId, sessionId, actorId, maxResults, includePayloads]
  );

  // Auto-load when the sheet opens or the target session/memory changes.
  useEffect(() => {
    if (open && memoryId && sessionId) {
      void fetchPage(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, memoryId, sessionId]);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ListEvents returns oldest→newest; show newest first.
  const displayed = [...events]
    .reverse()
    .filter((e) => (skipUnknownRole ? isKnownRole(e) : true));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Memory events</SheetTitle>
          <SheetDescription>
            ListEvents for session{" "}
            <span className="font-mono text-foreground">{sessionId}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-end gap-4 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Switch
              id="include-payloads"
              checked={includePayloads}
              onCheckedChange={(v) => setIncludePayloads(v)}
            />
            <Label htmlFor="include-payloads">Include payloads</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="skip-unknown-role"
              checked={skipUnknownRole}
              onCheckedChange={(v) => setSkipUnknownRole(v)}
            />
            <Label htmlFor="skip-unknown-role">Skip unknown-role</Label>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="max-results" className="text-xs text-muted-foreground">
              Max results
            </Label>
            <Input
              id="max-results"
              type="number"
              min={1}
              max={100}
              value={maxResults}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isNaN(n)) setMaxResults(n);
              }}
              className="h-7 w-20"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchPage(false)}
              disabled={loading || !memoryId}
            >
              <RefreshCw className={cn(loading && "animate-spin")} />
              Load
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void fetchPage(true, nextToken)}
              disabled={loading || !nextToken}
            >
              Load more
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {loading && events.length === 0 && !error && (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {!loading && !error && displayed.length === 0 && (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              No memory events for this session.
            </div>
          )}

          {displayed.length > 0 && (
            <div className="flex flex-col gap-2">
              {displayed.map((e) => {
                const key = roleKey(e);
                const isOpen = expanded.has(e.eventId);
                return (
                  <Card key={e.eventId} className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(e.eventId)}
                      className="flex w-full items-center gap-2 p-3 text-left hover:bg-muted/40"
                    >
                      <span className="text-base leading-none">
                        {roleIcon(key)}
                      </span>
                      <span className="text-sm font-medium">
                        {key === "UNKNOWN" ? "Unknown" : key}
                      </span>
                      <Badge variant="outline" className="text-[0.7rem]">
                        {e.type}
                      </Badge>
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                        {formatTs(e.timestamp)}
                      </span>
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground transition-transform",
                          isOpen && "rotate-180"
                        )}
                      />
                    </button>

                    {e.text && (
                      <div className="px-3 pb-2">
                        <p
                          className={cn(
                            "text-sm whitespace-pre-wrap break-words",
                            !isOpen && "line-clamp-4"
                          )}
                        >
                          {e.text}
                        </p>
                      </div>
                    )}

                    {e.tools && e.tools.length > 0 && (
                      <div className="flex flex-col gap-1 px-3 pb-2">
                        {e.tools.map((t, i) => (
                          <ToolBlockChip key={t.toolUseId ?? i} tool={t} />
                        ))}
                      </div>
                    )}

                    {!e.text && (!e.tools || e.tools.length === 0) && (
                      <div className="px-3 pb-2">
                        <p className="text-xs italic text-muted-foreground">
                          No displayable content.
                        </p>
                      </div>
                    )}

                    {isOpen && (
                      <div className="flex flex-col gap-2 border-t border-border px-3 py-2">
                        {e.messageId && (
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="w-20 shrink-0 text-muted-foreground">
                              messageId
                            </span>
                            <span className="truncate font-mono text-foreground">
                              {e.messageId}
                            </span>
                            <CopyButton
                              value={e.messageId}
                              className="ml-auto"
                              label="Copy messageId"
                            />
                          </div>
                        )}

                        {e.usage && (
                          <div className="flex flex-wrap gap-1.5">
                            {typeof e.usage.inputTokens === "number" && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[0.7rem] tabular-nums">
                                in {e.usage.inputTokens}
                              </span>
                            )}
                            {typeof e.usage.outputTokens === "number" && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[0.7rem] tabular-nums">
                                out {e.usage.outputTokens}
                              </span>
                            )}
                            {typeof e.usage.totalTokens === "number" && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[0.7rem] tabular-nums">
                                total {e.usage.totalTokens}
                              </span>
                            )}
                          </div>
                        )}

                        {e.metrics && Object.keys(e.metrics).length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(e.metrics).map(([k, v]) => (
                              <span
                                key={k}
                                className="rounded bg-muted px-1.5 py-0.5 text-[0.7rem] tabular-nums"
                              >
                                {k}: {String(v)}
                              </span>
                            ))}
                          </div>
                        )}

                        {e.branch?.name && (
                          <div className="text-xs text-muted-foreground">
                            branch:{" "}
                            <span className="font-mono text-foreground">
                              {e.branch.name}
                            </span>
                          </div>
                        )}

                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            Raw JSON
                          </summary>
                          <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted/50 p-2 font-mono text-[0.7rem] whitespace-pre-wrap break-words">
                            {JSON.stringify(e.raw, null, 2)}
                          </pre>
                        </details>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {loading && events.length > 0 && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Loading…
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
