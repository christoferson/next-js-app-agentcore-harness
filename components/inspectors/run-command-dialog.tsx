"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Play, Square, Terminal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { streamSse } from "@/lib/client/sse";
import type { StreamEvent } from "@/lib/stream/events";
import { cn } from "@/lib/utils";

const PRESETS = [
  "ls -la",
  "pwd",
  "cat /etc/os-release",
  "ps aux",
  "env",
  "df -h",
  "whoami",
] as const;

interface OutputLine {
  stream: "stdout" | "stderr" | "error";
  text: string;
}

export function RunCommandDialog({
  open,
  onOpenChange,
  agentRuntimeArn,
  sessionId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  agentRuntimeArn: string | null;
  sessionId: string;
}) {
  const [command, setCommand] = useState("");
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const ctrlRef = useRef<AbortController | null>(null);

  const onPreset = useCallback((value: string | null) => {
    if (value) setCommand(value);
  }, []);

  const onEvent = useCallback((e: StreamEvent) => {
    switch (e.type) {
      case "stdout":
        setLines((prev) => [...prev, { stream: "stdout", text: e.text }]);
        break;
      case "stderr":
        setLines((prev) => [...prev, { stream: "stderr", text: e.text }]);
        break;
      case "exit-code":
        setExitCode(e.code);
        setRunning(false);
        break;
      case "error":
        setLines((prev) => [
          ...prev,
          { stream: "error", text: `${e.code}: ${e.message}` },
        ]);
        break;
      default:
        // Ignore unknown event types (forward compatibility).
        break;
    }
  }, []);

  const run = useCallback(async () => {
    if (!agentRuntimeArn || !command.trim() || running) return;
    setLines([]);
    setExitCode(null);
    setRunning(true);
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    try {
      await streamSse(
        "/api/command",
        { agentRuntimeArn, sessionId, command },
        onEvent,
        ctrl.signal
      );
    } finally {
      if (ctrlRef.current === ctrl) ctrlRef.current = null;
      setRunning(false);
    }
  }, [agentRuntimeArn, command, sessionId, running, onEvent]);

  const stop = useCallback(() => {
    ctrlRef.current?.abort();
    ctrlRef.current = null;
    setRunning(false);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="size-4" />
            Run Command
          </DialogTitle>
        </DialogHeader>

        {agentRuntimeArn === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            This harness has no runtime environment ARN — Run Command unavailable.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-xs">Preset</Label>
              <Select value="" onValueChange={onPreset}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a preset command" />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Enter a command"
                className="font-mono text-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => void run()}
                disabled={running || !command.trim()}
              >
                {running ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Play />
                )}
                Run
              </Button>
              {running && (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={stop}
                >
                  <Square />
                  Stop
                </Button>
              )}
            </div>

            <div className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-black/80 p-3 font-mono text-xs text-slate-200">
              {lines.length === 0 && !running ? (
                <span className="text-slate-500">
                  Output will appear here.
                </span>
              ) : (
                lines.map((line, i) => (
                  <div
                    key={i}
                    className={cn(
                      line.stream === "stderr" && "text-red-400",
                      line.stream === "error" && "text-red-400"
                    )}
                  >
                    {line.text}
                  </div>
                ))
              )}
              {exitCode !== null && (
                <div className="mt-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium",
                      exitCode === 0
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-amber-500/15 text-amber-400"
                    )}
                  >
                    exit {exitCode}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
