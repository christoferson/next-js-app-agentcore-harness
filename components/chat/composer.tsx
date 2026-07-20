"use client";

import { useRef, useState } from "react";
import { SendIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Composer({
  onSend,
  onStop,
  streaming,
  disabled,
  placeholder,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
  disabled: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const grow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const submit = () => {
    const text = value.trim();
    if (!text || disabled || streaming) return;
    onSend(text);
    setValue("");
    requestAnimationFrame(() => {
      if (ref.current) ref.current.style.height = "auto";
    });
  };

  return (
    <div className="border-t border-border bg-background/80 p-3 backdrop-blur">
      <div
        className={cn(
          "mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-border bg-card p-2 shadow-sm transition-colors focus-within:border-ring",
          disabled && "opacity-60"
        )}
      >
        <textarea
          ref={ref}
          value={value}
          disabled={disabled}
          rows={1}
          placeholder={
            disabled ? "Select a harness to start chatting…" : placeholder ?? "Message the harness…"
          }
          onChange={(e) => {
            setValue(e.target.value);
            grow();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-52 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        {streaming ? (
          <Button variant="destructive" size="icon" onClick={onStop} title="Stop">
            <SquareIcon className="size-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={submit}
            disabled={disabled || !value.trim()}
            title="Send (Enter)"
          >
            <SendIcon className="size-4" />
          </Button>
        )}
      </div>
      <p className="mx-auto mt-1.5 max-w-3xl px-1 text-center text-[10px] text-muted-foreground">
        Enter to send · Shift+Enter for newline
      </p>
    </div>
  );
}
