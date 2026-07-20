"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { getJson, qs, ApiRequestError } from "@/lib/client/api";
import type { MemoryRecord, NamespaceStrategy } from "@/lib/client/types";
import { cn } from "@/lib/utils";

type Mode = "list" | "search";

function fmtDate(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function substitute(ns: string, actorId: string, sessionId: string): string {
  return ns
    .replaceAll("{actorId}", actorId)
    .replaceAll("{sessionId}", sessionId);
}

interface RecordsResponse {
  records: MemoryRecord[];
  nextToken?: string;
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
      {message}
    </p>
  );
}

function RecordCard({
  record,
  showScore,
}: {
  record: MemoryRecord;
  showScore: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {record.strategyId && (
          <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[10px]">
            {record.strategyId}
          </span>
        )}
        {showScore && record.score !== undefined && (
          <span className="inline-flex items-center rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 font-mono text-[10px] text-violet-400">
            score {record.score.toFixed(3)}
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {fmtDate(record.createdAt)}
        </span>
      </div>
      {record.text ? (
        <p className="whitespace-pre-wrap text-xs text-foreground">
          {record.text}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">(no text)</p>
      )}
      {record.namespaces.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {record.namespaces.map((ns) => (
            <span
              key={ns}
              className="inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
              {ns}
            </span>
          ))}
        </div>
      )}
      <details className="group">
        <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
          Raw record
        </summary>
        <pre className="mt-1.5 max-h-64 overflow-auto rounded bg-muted/40 p-2 text-[10px]">
          {JSON.stringify(record.raw, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export function LongTermMemorySheet({
  open,
  onOpenChange,
  memoryId,
  actorId,
  sessionId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  memoryId: string;
  actorId: string;
  sessionId: string;
}) {
  const [strategies, setStrategies] = useState<NamespaceStrategy[]>([]);
  const [strategiesLoading, setStrategiesLoading] = useState(false);
  const [strategiesError, setStrategiesError] = useState<string | null>(null);

  const [namespace, setNamespace] = useState("");
  const [mode, setMode] = useState<Mode>("list");

  const [query, setQuery] = useState("");
  const [maxResults, setMaxResults] = useState("20");

  const [records, setRecords] = useState<MemoryRecord[]>([]);
  const [nextToken, setNextToken] = useState<string | undefined>(undefined);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load strategies when opened / memoryId changes.
  useEffect(() => {
    if (!open || !memoryId) return;
    let cancelled = false;
    setStrategiesLoading(true);
    setStrategiesError(null);
    getJson<{ strategies: NamespaceStrategy[] }>(
      `/api/memory/namespaces${qs({ memoryId })}`
    )
      .then((res) => {
        if (!cancelled) setStrategies(res.strategies);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStrategiesError(
          err instanceof ApiRequestError
            ? err.message
            : "Failed to load namespaces."
        );
      })
      .finally(() => {
        if (!cancelled) setStrategiesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, memoryId]);

  // Reset transient state on memory change.
  useEffect(() => {
    setNamespace("");
    setRecords([]);
    setNextToken(undefined);
    setRecordsError(null);
    setLoaded(false);
  }, [memoryId]);

  const templateOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of strategies) for (const ns of s.namespaces) set.add(ns);
    return Array.from(set);
  }, [strategies]);

  const substituted = useMemo(
    () => substitute(namespace, actorId, sessionId),
    [namespace, actorId, sessionId]
  );
  const unresolved = substituted.includes("{");
  const maxResultsNum = Number(maxResults) || undefined;

  const fetchRecords = useCallback(
    async (token?: string) => {
      if (!namespace || unresolved) return;
      setRecordsLoading(true);
      setRecordsError(null);
      try {
        const res = await getJson<RecordsResponse>(
          `/api/memory/records${qs({
            memoryId,
            namespace: substituted,
            query: mode === "search" ? query : undefined,
            maxResults: maxResultsNum,
            nextToken: token,
          })}`
        );
        setRecords((prev) => (token ? [...prev, ...res.records] : res.records));
        setNextToken(res.nextToken);
        setLoaded(true);
      } catch (err: unknown) {
        setRecordsError(
          err instanceof ApiRequestError ? err.message : "Failed to load records."
        );
      } finally {
        setRecordsLoading(false);
      }
    },
    [memoryId, namespace, substituted, unresolved, mode, query, maxResultsNum]
  );

  const runPrimary = useCallback(() => {
    setRecords([]);
    setNextToken(undefined);
    void fetchRecords(undefined);
  }, [fetchRecords]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Long-term Memory</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-5">
          {/* Strategies */}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Strategies
            </h3>
            {strategiesLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : strategiesError ? (
              <ErrorNotice message={strategiesError} />
            ) : strategies.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No strategies configured for this memory.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {strategies.map((s) => (
                  <div
                    key={s.strategyId}
                    className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/20 p-2.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium">{s.name}</span>
                      {s.type && (
                        <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px]">
                          {s.type}
                        </span>
                      )}
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {s.strategyId}
                      </span>
                    </div>
                    {s.namespaces.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {s.namespaces.map((ns) => (
                          <button
                            key={ns}
                            type="button"
                            onClick={() => setNamespace(ns)}
                            className="inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-violet-500/40 hover:text-violet-400"
                          >
                            {ns}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <Separator />

          {/* Namespace selection */}
          <section className="flex flex-col gap-2">
            <Label className="text-xs">Namespace template</Label>
            <Select
              value={namespace}
              onValueChange={(v) => setNamespace(v ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a namespace template" />
              </SelectTrigger>
              <SelectContent>
                {templateOptions.map((ns) => (
                  <SelectItem key={ns} value={ns}>
                    {ns}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              placeholder="Or type a custom namespace"
              className="font-mono text-xs"
            />
            <div className="text-xs">
              <span className="text-muted-foreground">Preview: </span>
              <span className="font-mono text-violet-400">
                {substituted || "—"}
              </span>
            </div>
            {unresolved && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                Unresolved template — pick or complete the namespace
              </p>
            )}
          </section>

          {/* Mode toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "list" ? "default" : "outline"}
              onClick={() => setMode("list")}
            >
              List All
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "search" ? "default" : "outline"}
              onClick={() => setMode("search")}
            >
              Search
            </Button>
          </div>

          {mode === "search" && (
            <div className="flex flex-col gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search query"
              />
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">
                  Max results
                </Label>
                <Input
                  type="number"
                  value={maxResults}
                  onChange={(e) => setMaxResults(e.target.value)}
                  className="w-24"
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={runPrimary}
              disabled={!namespace || unresolved || recordsLoading}
            >
              {recordsLoading ? (
                <Loader2 className="animate-spin" />
              ) : mode === "search" ? (
                <Search />
              ) : (
                <RefreshCw />
              )}
              {mode === "search" ? "Search" : "Load"}
            </Button>
          </div>

          {/* Results */}
          <section className="flex flex-col gap-2">
            {recordsError && <ErrorNotice message={recordsError} />}

            {recordsLoading && records.length === 0 ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : loaded && records.length === 0 && !recordsError ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No records in this namespace.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {records.map((r) => (
                  <RecordCard
                    key={r.memoryRecordId}
                    record={r}
                    showScore={mode === "search"}
                  />
                ))}
              </div>
            )}

            {nextToken && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn("self-start")}
                onClick={() => void fetchRecords(nextToken)}
                disabled={recordsLoading}
              >
                {recordsLoading ? <Loader2 className="animate-spin" /> : null}
                Load more
              </Button>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
