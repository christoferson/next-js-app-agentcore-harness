"use client";

import { useCallback, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  className,
  label = "Copy",
}: {
  value: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      },
      () => {}
    );
  }, [value]);

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className
      )}
    >
      {copied ? (
        <CheckIcon className="size-3 text-emerald-500" />
      ) : (
        <CopyIcon className="size-3" />
      )}
    </button>
  );
}

/** Monospace ID/ARN row with a copy affordance (SPEC §6 polish). */
export function IdField({
  label,
  value,
  accent,
  truncate = true,
}: {
  label: string;
  value: string;
  accent?: "violet" | "blue" | "default";
  truncate?: boolean;
}) {
  const accentClass =
    accent === "violet"
      ? "text-violet-400"
      : accent === "blue"
        ? "text-blue-400"
        : "text-foreground";
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono tabular-nums",
          accentClass,
          truncate && "truncate"
        )}
        title={value}
      >
        {value}
      </span>
      <CopyButton value={value} className="ml-auto" label={`Copy ${label}`} />
    </div>
  );
}
