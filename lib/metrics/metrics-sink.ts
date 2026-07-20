import 'server-only';

export interface UsageRecord {
  userId: string;
  modelId: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
  latencyMs?: number;
}

export interface MetricsSink {
  record(usage: UsageRecord): void;
}

/** Metrics seam: v1 no-op. A CloudWatch Logs sink slots in behind this. */
class NoopMetricsSink implements MetricsSink {
  record(): void {}
}

export const metricsSink: MetricsSink = new NoopMetricsSink();
