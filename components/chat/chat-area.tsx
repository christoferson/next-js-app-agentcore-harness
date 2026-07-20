"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SparklesIcon } from "lucide-react";
import type { ChatMessage } from "@/lib/client/use-chat";
import { cn } from "@/lib/utils";
import { MessageBubble } from "./message";
import { Composer } from "./composer";

function EmptyState({ harnessName }: { harnessName?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-400">
        <SparklesIcon className="size-6" />
      </div>
      <h2 className="text-lg font-semibold">
        {harnessName ? `Chat with ${harnessName}` : "Select a harness"}
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        A <span className="font-medium text-foreground">harness</span> is a managed
        agent runtime on Amazon Bedrock AgentCore — it owns the model, tools, and
        memory. Send a message and the harness streams back its reasoning, tool
        calls, and response. Conversation state lives in the harness&apos;s bound
        memory, keyed by your session.
      </p>
    </div>
  );
}

export function ChatArea({
  messages,
  streaming,
  onSend,
  onStop,
  harnessName,
  canChat,
  railOpen = false,
}: {
  messages: ChatMessage[];
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  harnessName?: string;
  canChat: boolean;
  /** When the activity rail is open, left-align the column instead of centering. */
  railOpen?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState(true); // auto-scroll unless user scrolls up

  // Track whether the user has scrolled away from the bottom (scroll-lock).
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setLocked(nearBottom);
  };

  useLayoutEffect(() => {
    if (!locked) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  useEffect(() => {
    // On new message count, snap to bottom regardless (new turn).
    setLocked(true);
  }, [messages.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {messages.length === 0 ? (
          <EmptyState harnessName={harnessName} />
        ) : (
          <div
            className={cn(
              "flex flex-col gap-5 py-6",
              // Rail open: fill the space between sidebar and rail (wider cap,
              // centered within it). Rail closed: classic centered chat column.
              railOpen
                ? "mx-auto w-full max-w-5xl px-6"
                : "mx-auto max-w-3xl px-4"
            )}
          >
            {messages.map((m) => (
              <MessageBubble key={m.id} m={m} />
            ))}
          </div>
        )}
      </div>
      <Composer
        onSend={onSend}
        onStop={onStop}
        streaming={streaming}
        disabled={!canChat}
        railOpen={railOpen}
      />
    </div>
  );
}
