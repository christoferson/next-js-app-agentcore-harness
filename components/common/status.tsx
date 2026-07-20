import { cn } from "@/lib/utils";

// Harness status → color. READY = emerald, *_FAILED = red, transitional = amber.
function statusColor(status: string): string {
  const s = status.toUpperCase();
  if (s === "READY" || s === "ACTIVE") return "bg-emerald-500";
  if (s.includes("FAILED")) return "bg-red-500";
  if (s.includes("DELET")) return "bg-red-400";
  return "bg-amber-500"; // CREATING / UPDATING / UNKNOWN
}

export function StatusDot({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        statusColor(status),
        className
      )}
      title={status}
    />
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium">
      <StatusDot status={status} />
      {status}
    </span>
  );
}
