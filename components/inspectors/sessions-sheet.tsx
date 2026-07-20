"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import type { ParsedEvent, SessionSummary } from "@/lib/client/types";
import type { ChatMessage } from "@/lib/client/use-chat";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/common/copy-button";
import { cn } from "@/lib/utils";

interface SessionsSheetProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  memoryId: string;
  actorId: string;
  currentSessionId: string;
  onResume: (sessionId: string, messages: ChatMessage[]) => void;
}

interface SessionsResponse {
  sessions: SessionSummary[];
  nextToken?: string;
}

interface EventsResponse {
  events: ParsedEvent[];
  nextToken?: string;
}

interface PreviewState {
  sessionId: string;
  loading: boolean;
  error: string | null;
  events: ParsedEvent[];
}

function roleOf(e: ParsedEvent): "USER" | "ASSISTANT" | "OTHER" {
  if (e.type !== "conversational") return "OTHER";
  const r = (e.role ?? "").toUpperCase();
  if (r === "USER") return "USER";
  if (r === "ASSISTANT") return "ASSISTANT";
  return "OTHER";
}

function formatTs(ts?: string): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

export function SessionsSheet({
  open,
  onOpenChange,
  memoryId,
  actorId,
  currentSessionId,
  onResume,
}: SessionsSheetProps) {
  const [hasEventsOnly, setHasEventsOnly] = useState(true);
  const maxResults = 50;

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [nextToken, setNextToken] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const fetchPage = useCallback(
    async (append: boolean, token?: string) => {
      if (!memoryId || !actorId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await getJson<SessionsResponse>(
          "/api/sessions" +
            qs({
              memoryId,
              actorId,
              hasEventsOnly: hasEventsOnly ? "true" : "false",
              maxResults,
              nextToken: token,
            })
        );
        setNextToken(res.nextToken);
        setSessions((prev) =>
          append ? [...prev, ...res.sessions] : res.sessions
        );
      } catch (err) {
        if (err instanceof ApiRequestError) setError(err.message);
        else if (err instanceof Error) setError(err.message);
        else setError("Failed to load sessions.");
      } finally {
        setLoading(false);
      }
    },
    [memoryId, actorId, hasEventsOnly]
  );

  useEffect(() => {
    if (open && memoryId && actorId) {
      setPreview(null);
      void fetchPage(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, memoryId, actorId]);

  const loadPreview = useCallback(
    async (sessionId: string) => {
      setPreview({ sessionId, loading: true, error: null, events: [] });
      try {
        const res = await getJson<EventsResponse>(
          "/api/memory/events" +
            qs({
              memoryId,
              sessionId,
              actorId,
              includePayloads: "true",
              maxResults: 50,
            })
        );
        setPreview({
          sessionId,
          loading: false,
          error: null,
          events: res.events,
        });
      } catch (err) {
        const message =
          err instanceof ApiRequestError || err instanceof Error
            ? err.message
            : "Failed to load preview.";
        setPreview({ sessionId, loading: false, error: message, events: [] });
      }
    },
    [memoryId, actorId]
  );

  const resume = useCallback(
    (sessionId: string, events: ParsedEvent[]) => {
      const messages: ChatMessage[] = [];
      let index = 0;
      for (const e of events) {
        const role = roleOf(e);
        if (role !== "USER" && role !== "ASSISTANT") continue;
        messages.push({
          id: `r${index}`,
          role: role === "USER" ? "user" : "assistant",
          text: e.text ?? "",
          tools: [],
        });
        index += 1;
      }
      onResume(sessionId, messages);
      onOpenChange(false);
    },
    [onResume, onOpenChange]
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Sessions</SheetTitle>
          <SheetDescription>
            ListSessions for actor{" "}
            <span className="font-mono text-foreground">{actorId}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-center gap-4 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Switch
              id="has-events-only"
              checked={hasEventsOnly}
              onCheckedChange={(v) => setHasEventsOnly(v)}
            />
            <Label htmlFor="has-events-only">Has events only</Label>
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

          {loading && sessions.length === 0 && !error && (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {!loading && !error && sessions.length === 0 && (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              No sessions found for this actor.
            </div>
          )}

          {sessions.length > 0 && (
            <div className="flex flex-col gap-2">
              {sessions.map((s) => {
                const isCurrent = s.sessionId === currentSessionId;
                const isPreviewing = preview?.sessionId === s.sessionId;
                return (
                  <Card
                    key={s.sessionId}
                    className={cn(
                      "p-3",
                      isCurrent && "ring-1 ring-violet-500/40"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="truncate font-mono text-xs text-foreground"
                        title={s.sessionId}
                      >
                        {s.sessionId}
                      </span>
                      <CopyButton
                        value={s.sessionId}
                        label="Copy sessionId"
                      />
                      {isCurrent && (
                        <Badge
                          variant="outline"
                          className="border-violet-500/40 text-violet-400"
                        >
                          current
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        onClick={() => void loadPreview(s.sessionId)}
                        disabled={preview?.loading && isPreviewing}
                      >
                        Preview
                      </Button>
                    </div>

                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        {formatTs(s.createdAt)}
                      </span>
                      <span className="font-mono">{s.actorId}</span>
                    </div>

                    {isPreviewing && (
                      <div className="mt-2 border-t border-border pt-2">
                        {preview.loading && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="size-3 animate-spin" />
                            Loading preview…
                          </div>
                        )}

                        {preview.error && (
                          <div className="text-xs text-red-400">
                            {preview.error}
                          </div>
                        )}

                        {!preview.loading && !preview.error && (
                          <>
                            <div className="flex flex-col gap-1">
                              {preview.events
                                .filter(
                                  (e) =>
                                    roleOf(e) === "USER" ||
                                    roleOf(e) === "ASSISTANT"
                                )
                                .map((e) => (
                                  <div
                                    key={e.eventId}
                                    className="flex gap-1.5 text-xs"
                                  >
                                    <span className="leading-none">
                                      {roleOf(e) === "USER" ? "👤" : "🤖"}
                                    </span>
                                    <span className="truncate text-muted-foreground">
                                      {(e.text ?? "").slice(0, 140)}
                                    </span>
                                  </div>
                                ))}
                              {preview.events.filter(
                                (e) =>
                                  roleOf(e) === "USER" ||
                                  roleOf(e) === "ASSISTANT"
                              ).length === 0 && (
                                <div className="text-xs text-muted-foreground">
                                  No conversational messages in this session.
                                </div>
                              )}
                            </div>
                            <div className="mt-2">
                              <Button
                                size="sm"
                                onClick={() =>
                                  resume(s.sessionId, preview.events)
                                }
                              >
                                Resume
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {loading && sessions.length > 0 && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Loading…
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
