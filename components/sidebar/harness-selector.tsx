"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react";
import type { HarnessSummary } from "@/lib/client/types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusDot } from "@/components/common/status";
import { cn } from "@/lib/utils";

export function HarnessSelector({
  harnesses,
  selected,
  onSelect,
  onRefresh,
  loading,
}: {
  harnesses: HarnessSummary[];
  selected: HarnessSummary | null;
  onSelect: (h: HarnessSummary) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K opens the combobox (SPEC §6).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
    else setQuery("");
  }, [open]);

  const filtered = harnesses.filter(
    (h) =>
      h.name.toLowerCase().includes(query.toLowerCase()) ||
      h.id.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className="h-9 flex-1 justify-between font-normal"
            />
          }
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected ? (
              <>
                <StatusDot status={selected.status} />
                <span className="truncate">{selected.name}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Select harness…</span>
            )}
          </span>
          <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent className="p-0">
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
            <SearchIcon className="size-3.5 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search harnesses…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="rounded border border-border px-1 text-[10px] text-muted-foreground">
              ⌘K
            </kbd>
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {loading ? (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                Loading harnesses…
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                {harnesses.length === 0
                  ? "No harnesses found in this account/region."
                  : "No matches."}
              </div>
            ) : (
              filtered.map((h) => (
                <button
                  key={h.arn}
                  type="button"
                  onClick={() => {
                    onSelect(h);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted",
                    selected?.arn === h.arn && "bg-muted"
                  )}
                >
                  <StatusDot status={h.status} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{h.name}</span>
                    <span className="block truncate font-mono text-[10px] text-muted-foreground">
                      {h.status} · {h.id}
                    </span>
                  </span>
                  {selected?.arn === h.arn && (
                    <CheckIcon className="size-3.5 shrink-0 text-violet-400" />
                  )}
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
      <Button
        variant="outline"
        size="icon"
        className="size-9"
        onClick={onRefresh}
        disabled={loading}
        title="Refresh harness list"
      >
        <RefreshCwIcon className={cn("size-4", loading && "animate-spin")} />
      </Button>
    </div>
  );
}
