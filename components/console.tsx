"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DatabaseIcon,
  FileTextIcon,
  HistoryIcon,
  PlusIcon,
  TerminalIcon,
} from "lucide-react";
import type { HarnessModelConfig } from "@/lib/models/client";
import type {
  HarnessDetails,
  HarnessSummary,
} from "@/lib/client/types";
import { getJson } from "@/lib/client/api";
import { useActor } from "@/lib/client/use-actor";
import { useSession } from "@/lib/client/use-session";
import { useChat, type ChatMessage } from "@/lib/client/use-chat";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { StatusBadge } from "@/components/common/status";
import { IdField } from "@/components/common/copy-button";
import { HarnessSelector } from "@/components/sidebar/harness-selector";
import {
  OverridesPanel,
  buildOverrides,
  type OverrideState,
} from "@/components/sidebar/overrides-panel";
import { ChatArea } from "@/components/chat/chat-area";
import { HarnessDetailsDialog } from "@/components/inspectors/harness-details-dialog";
import { MemoryEventsSheet } from "@/components/inspectors/memory-events-sheet";
import { SessionsSheet } from "@/components/inspectors/sessions-sheet";
import { LongTermMemorySheet } from "@/components/inspectors/long-term-memory-sheet";
import { RunCommandDialog } from "@/components/inspectors/run-command-dialog";

const DEFAULT_OVERRIDES: OverrideState = {
  modelOn: false,
  modelId: "",
  tempOn: false,
  temperature: 0.1,
  maxTokensOn: false,
  maxTokens: 4096,
  systemPromptOn: false,
  systemPrompt: "",
};

export function Console() {
  const { actorId } = useActor();
  const { sessionId, rotate, adopt } = useSession();
  const chat = useChat();

  const [models, setModels] = useState<HarnessModelConfig[]>([]);
  const [defaultModelId, setDefaultModelId] = useState("");

  const [harnesses, setHarnesses] = useState<HarnessSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selected, setSelected] = useState<HarnessSummary | null>(null);
  const [details, setDetails] = useState<HarnessDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [overrides, setOverrides] = useState<OverrideState>(DEFAULT_OVERRIDES);

  // Inspector open state.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [ltmOpen, setLtmOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  // Load client-safe model registry once.
  useEffect(() => {
    getJson<{ models: HarnessModelConfig[]; defaultModelId: string }>(
      "/api/models"
    )
      .then((r) => {
        setModels(r.models);
        setDefaultModelId(r.defaultModelId);
      })
      .catch(() => {});
  }, []);

  const loadHarnesses = useCallback(async (refresh = false) => {
    setListLoading(true);
    setListError(null);
    try {
      const r = await getJson<{ harnesses: HarnessSummary[] }>(
        `/api/harnesses${refresh ? "?refresh=1" : ""}`
      );
      setHarnesses(r.harnesses);
    } catch (err) {
      setListError((err as Error).message);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHarnesses();
  }, [loadHarnesses]);

  // Loading details seeds override defaults (model, system prompt, maxTokens).
  const loadDetails = useCallback(
    async (h: HarnessSummary) => {
      setDetailsLoading(true);
      setDetails(null);
      try {
        const r = await getJson<{ harness: HarnessDetails }>(
          `/api/harnesses/${encodeURIComponent(h.id)}`
        );
        setDetails(r.harness);
        // Seed overrides from the harness config (SPEC §2).
        setOverrides((s) => ({
          ...s,
          modelId:
            r.harness.model.modelId && findModel(r.harness.model.modelId)
              ? r.harness.model.modelId
              : defaultModelId || s.modelId,
          maxTokens: r.harness.model.maxTokens ?? r.harness.maxTokens ?? s.maxTokens,
          systemPrompt: r.harness.systemPrompt || s.systemPrompt,
        }));
      } catch {
        setDetails(null);
      } finally {
        setDetailsLoading(false);
      }
    },
    [defaultModelId]
  );

  const findModel = useCallback(
    (id: string) => models.find((m) => m.modelId === id),
    [models]
  );

  const onSelectHarness = useCallback(
    (h: HarnessSummary) => {
      setSelected(h);
      chat.reset();
      loadDetails(h);
    },
    [chat, loadDetails]
  );

  const onSend = useCallback(
    (text: string) => {
      if (!selected) return;
      chat.send(text, {
        harnessArn: selected.arn,
        sessionId,
        actorId,
        overrides: buildOverrides(overrides),
      });
    },
    [selected, sessionId, actorId, overrides, chat]
  );

  const onNewSession = useCallback(async () => {
    await rotate();
    chat.reset();
  }, [rotate, chat]);

  const onResume = useCallback(
    (resumedSessionId: string, messages: ChatMessage[]) => {
      adopt(resumedSessionId);
      chat.loadHistory(messages);
    },
    [adopt, chat]
  );

  const memoryId = details?.memoryId ?? null;
  const canChat = Boolean(selected);

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-md bg-violet-500/20 text-violet-400">
              <DatabaseIcon className="size-3.5" />
            </div>
            <span className="text-sm font-semibold">AgentCore Console</span>
          </div>
          <ThemeToggle />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {/* Harness selector */}
          <HarnessSelector
            harnesses={harnesses}
            selected={selected}
            onSelect={onSelectHarness}
            onRefresh={() => loadHarnesses(true)}
            loading={listLoading}
          />
          {listError && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-xs text-red-400">
              {listError}
            </p>
          )}

          {/* Selected harness card */}
          {selected && (
            <div className="space-y-2 rounded-xl border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {selected.name}
                </span>
                <StatusBadge status={selected.status} />
              </div>
              <IdField label="ID" value={selected.id} />
              <IdField label="ARN" value={selected.arn} />
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setDetailsOpen(true)}
              >
                <FileTextIcon className="size-3.5" />
                Details
              </Button>
            </div>
          )}

          {/* Overrides */}
          {selected && models.length > 0 && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase">
                Overrides
              </span>
              <OverridesPanel
                models={models}
                state={overrides}
                setState={(u) => setOverrides(u)}
                configuredSystemPrompt={details?.systemPrompt ?? ""}
              />
            </div>
          )}

          {/* Session card */}
          <div className="space-y-2 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
            <span className="text-xs font-semibold text-violet-400 uppercase">
              Session
            </span>
            <IdField label="Session" value={sessionId || "…"} accent="violet" />
            <IdField label="Actor" value={actorId} accent="violet" />
            {memoryId && (
              <IdField label="Memory" value={memoryId} accent="violet" />
            )}
          </div>

          {/* Inspector buttons */}
          <div className="space-y-1.5">
            {memoryId && (
              <>
                <InspectorButton
                  icon={<HistoryIcon className="size-3.5" />}
                  label="Memory Events"
                  onClick={() => setEventsOpen(true)}
                />
                <InspectorButton
                  icon={<DatabaseIcon className="size-3.5" />}
                  label="Long-Term Memory"
                  onClick={() => setLtmOpen(true)}
                />
                <InspectorButton
                  icon={<HistoryIcon className="size-3.5" />}
                  label="Sessions"
                  onClick={() => setSessionsOpen(true)}
                />
              </>
            )}
            {selected && (
              <InspectorButton
                icon={<TerminalIcon className="size-3.5" />}
                label="Run Command"
                onClick={() => setCommandOpen(true)}
              />
            )}
          </div>
        </div>

        {/* New session */}
        <div className="border-t border-border p-3">
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={onNewSession}
          >
            <PlusIcon className="size-3.5" />
            New Session
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        {listLoading && harnesses.length === 0 ? (
          <div className="flex flex-1 flex-col gap-3 p-8">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-24 w-full max-w-2xl" />
            <Skeleton className="h-24 w-full max-w-2xl" />
          </div>
        ) : (
          <ChatArea
            messages={chat.messages}
            streaming={chat.streaming}
            onSend={onSend}
            onStop={chat.stop}
            harnessName={selected?.name}
            canChat={canChat}
          />
        )}
      </main>

      {/* Inspectors */}
      <HarnessDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        details={details}
        loading={detailsLoading}
      />
      {memoryId && (
        <>
          <MemoryEventsSheet
            open={eventsOpen}
            onOpenChange={setEventsOpen}
            memoryId={memoryId}
            sessionId={sessionId}
            actorId={actorId}
          />
          <SessionsSheet
            open={sessionsOpen}
            onOpenChange={setSessionsOpen}
            memoryId={memoryId}
            actorId={actorId}
            currentSessionId={sessionId}
            onResume={onResume}
          />
          <LongTermMemorySheet
            open={ltmOpen}
            onOpenChange={setLtmOpen}
            memoryId={memoryId}
            actorId={actorId}
            sessionId={sessionId}
          />
        </>
      )}
      <RunCommandDialog
        open={commandOpen}
        onOpenChange={setCommandOpen}
        commandTarget={details?.arn ?? null}
        sessionId={sessionId}
      />
    </div>
  );
}

function InspectorButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
    >
      <span className="text-muted-foreground">{icon}</span>
      {label}
    </button>
  );
}
