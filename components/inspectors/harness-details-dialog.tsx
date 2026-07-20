"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { IdField } from "@/components/common/copy-button";
import { StatusBadge } from "@/components/common/status";
import type { HarnessDetails } from "@/lib/client/types";
import { cn } from "@/lib/utils";

function fmtDate(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="w-28 shrink-0 pt-0.5 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-foreground">{children}</span>
    </div>
  );
}

function Chip({
  label,
  value,
}: {
  label: string;
  value: number | string | undefined;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-muted/30 px-3 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-sm tabular-nums text-foreground">
        {value === undefined || value === "" ? "—" : value}
      </span>
    </div>
  );
}

export function HarnessDetailsDialog({
  open,
  onOpenChange,
  details,
  loading,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  details: HarnessDetails | null;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Harness Details</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ))}
          </div>
        ) : !details ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Select a harness and load details.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
            <Section title="Identity">
              <Row label="Name">{details.name}</Row>
              <IdField label="ID" value={details.id} />
              <IdField label="ARN" value={details.arn} />
              <Row label="Status">
                <StatusBadge status={details.status} />
              </Row>
              <Row label="Description">
                {details.description ? (
                  details.description
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Row>
            </Section>

            <Section title="Memory">
              <Row label="Shape">
                <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium">
                  {details.memoryShape}
                </span>
              </Row>
              {details.memoryId ? (
                <IdField label="Memory ID" value={details.memoryId} />
              ) : (
                <Row label="Memory ID">
                  <span className="text-muted-foreground">No memory bound</span>
                </Row>
              )}
              {details.memoryArn && (
                <IdField label="Memory ARN" value={details.memoryArn} />
              )}
              {details.agentRuntimeArn && (
                <IdField label="Runtime ARN" value={details.agentRuntimeArn} />
              )}
            </Section>

            <Section title="Limits">
              <div className="flex flex-wrap gap-2">
                <Chip label="Max iterations" value={details.maxIterations} />
                <Chip label="Max tokens" value={details.maxTokens} />
                <Chip label="Timeout (s)" value={details.timeoutSeconds} />
              </div>
            </Section>

            <Section title="Timestamps">
              <Row label="Created">{fmtDate(details.createdAt)}</Row>
              <Row label="Updated">{fmtDate(details.updatedAt)}</Row>
            </Section>

            <Section title="Default Model & Inference" className="md:col-span-2">
              <Row label="Model ID">
                {details.model.modelId ? (
                  <span className="font-mono text-xs">
                    {details.model.modelId}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Row>
              <div className="flex flex-wrap gap-2">
                <Chip label="Temperature" value={details.model.temperature} />
                <Chip label="Max tokens" value={details.model.maxTokens} />
                <Chip label="Top P" value={details.model.topP} />
                <Chip label="API format" value={details.model.apiFormat} />
              </div>
            </Section>

            <Section title="System Prompt" className="md:col-span-2">
              {details.systemPrompt ? (
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-xs">
                  {details.systemPrompt}
                </pre>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No system prompt configured.
                </p>
              )}
            </Section>

            <Section title="Raw" className="md:col-span-2">
              <details className="group">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  Raw JSON
                </summary>
                <pre
                  className={cn(
                    "mt-2 max-h-96 overflow-auto rounded bg-muted/40 p-2 text-xs"
                  )}
                >
                  {JSON.stringify(details.raw, null, 2)}
                </pre>
              </details>
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
