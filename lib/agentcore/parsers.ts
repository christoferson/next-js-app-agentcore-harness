// Pure payload parsers (CLAUDE.md §4): NO AWS SDK, NO React, NO Next imports.
// Every function tolerates missing/unknown shapes and degrades gracefully —
// never throws on unexpected input (SPEC §1 defensive parsing).
//
// These operate on `unknown` / loosely-typed SDK output objects so the module
// stays free of AWS type imports and can be unit-tested with synthetic data.

// ── Harness details (SPEC §5.1) ─────────────────────────────────────────────

export interface HarnessSummary {
  arn: string;
  name: string;
  id: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface HarnessModelDefaults {
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  apiFormat?: string;
}

export interface HarnessDetails {
  arn: string;
  name: string;
  id: string;
  status: string;
  description?: string;
  /** memory ID parsed from the ARN segment after `memory/`; null when unbound */
  memoryId: string | null;
  memoryArn: string | null;
  memoryShape: 'agentCore' | 'managed' | 'disabled' | 'none';
  /** runtime ARN for Run Command (InvokeAgentRuntimeCommand target) */
  agentRuntimeArn: string | null;
  model: HarnessModelDefaults;
  systemPrompt: string;
  maxIterations?: number;
  maxTokens?: number;
  timeoutSeconds?: number;
  createdAt?: string;
  updatedAt?: string;
  /** full raw response for the JSON viewer */
  raw: unknown;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function asDateString(v: unknown): string | undefined {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return undefined;
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Extract the memory ID from a memory ARN: the segment after `memory/`. */
export function memoryIdFromArn(arn: string | undefined): string | null {
  if (!arn) return null;
  const idx = arn.indexOf('memory/');
  if (idx === -1) {
    // Not an ARN we recognise — some APIs accept the bare id; return as-is.
    return arn.includes(':') ? null : arn || null;
  }
  const tail = arn.slice(idx + 'memory/'.length);
  // ARNs may carry trailing segments; the id is up to the next '/' if any.
  return tail.split('/')[0] || null;
}

export function parseHarnessSummaries(listOutput: unknown): HarnessSummary[] {
  const harnesses = isRecord(listOutput) ? listOutput.harnesses : undefined;
  if (!Array.isArray(harnesses)) return [];
  return harnesses.flatMap((h): HarnessSummary[] => {
    if (!isRecord(h)) return [];
    const arn = asString(h.arn);
    if (!arn) return [];
    return [
      {
        arn,
        name: asString(h.harnessName) ?? asString(h.name) ?? '(unnamed)',
        id: asString(h.harnessId) ?? asString(h.id) ?? arn,
        status: asString(h.status) ?? 'UNKNOWN',
        createdAt: asDateString(h.createdAt),
        updatedAt: asDateString(h.updatedAt),
      },
    ];
  });
}

function parseModelDefaults(model: unknown): HarnessModelDefaults {
  // model is a union: bedrockModelConfig | openAiModelConfig | geminiModelConfig
  // | liteLlmModelConfig. Read whichever is present (SPEC §5.1).
  if (!isRecord(model)) return {};
  const cfg =
    (isRecord(model.bedrockModelConfig) && model.bedrockModelConfig) ||
    (isRecord(model.openAiModelConfig) && model.openAiModelConfig) ||
    (isRecord(model.geminiModelConfig) && model.geminiModelConfig) ||
    (isRecord(model.liteLlmModelConfig) && model.liteLlmModelConfig) ||
    undefined;
  if (!cfg) return {};
  return {
    modelId: asString(cfg.modelId),
    temperature: asNumber(cfg.temperature),
    maxTokens: asNumber(cfg.maxTokens),
    topP: asNumber(cfg.topP),
    apiFormat: asString(cfg.apiFormat),
  };
}

function joinSystemPrompt(systemPrompt: unknown): string {
  if (!Array.isArray(systemPrompt)) return '';
  return systemPrompt
    .map((b) => (isRecord(b) ? asString(b.text) : undefined))
    .filter((t): t is string => typeof t === 'string')
    .join('\n');
}

/**
 * Parse GetHarness output. Handles BOTH memory config shapes (CLAUDE.md §3):
 * `agentCoreMemoryConfiguration.arn` (newer) then `managedMemoryConfiguration.arn`
 * (legacy). Extracts runtime ARN for Run Command.
 */
export function parseHarnessDetails(getOutput: unknown): HarnessDetails {
  const harness = isRecord(getOutput) ? getOutput.harness : undefined;
  const h = isRecord(harness) ? harness : {};

  const arn = asString(h.arn) ?? '';
  const memory = isRecord(h.memory) ? h.memory : undefined;

  let memoryArn: string | null = null;
  let memoryShape: HarnessDetails['memoryShape'] = 'none';
  if (memory) {
    const agentCore = isRecord(memory.agentCoreMemoryConfiguration)
      ? memory.agentCoreMemoryConfiguration
      : undefined;
    const managed = isRecord(memory.managedMemoryConfiguration)
      ? memory.managedMemoryConfiguration
      : undefined;
    if (agentCore && asString(agentCore.arn)) {
      memoryArn = asString(agentCore.arn)!;
      memoryShape = 'agentCore';
    } else if (managed && asString(managed.arn)) {
      memoryArn = asString(managed.arn)!;
      memoryShape = 'managed';
    } else if ('disabled' in memory) {
      memoryShape = 'disabled';
    }
  }

  // Runtime ARN for Run Command (InvokeAgentRuntimeCommand target).
  let agentRuntimeArn: string | null = null;
  const env = isRecord(h.environment) ? h.environment : undefined;
  const acEnv =
    env && isRecord(env.agentCoreRuntimeEnvironment)
      ? env.agentCoreRuntimeEnvironment
      : undefined;
  if (acEnv) agentRuntimeArn = asString(acEnv.agentRuntimeArn) ?? null;

  return {
    arn,
    name: asString(h.harnessName) ?? '(unnamed)',
    id: asString(h.harnessId) ?? arn,
    status: asString(h.status) ?? 'UNKNOWN',
    description: asString(h.description),
    memoryId: memoryIdFromArn(memoryArn ?? undefined),
    memoryArn,
    memoryShape,
    agentRuntimeArn,
    model: parseModelDefaults(h.model),
    systemPrompt: joinSystemPrompt(h.systemPrompt),
    maxIterations: asNumber(h.maxIterations),
    maxTokens: asNumber(h.maxTokens),
    timeoutSeconds: asNumber(h.timeoutSeconds),
    createdAt: asDateString(h.createdAt),
    updatedAt: asDateString(h.updatedAt),
    raw: getOutput,
  };
}

// ── Short-term memory events (SPEC §5.3) ────────────────────────────────────

export interface EventUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export type ParsedEventType = 'conversational' | 'blob' | 'unknown';

export interface ParsedEvent {
  eventId: string;
  timestamp?: string;
  type: ParsedEventType;
  /** USER | ASSISTANT | TOOL | OTHER (uppercased) when conversational */
  role?: string;
  /** decoded message text (best-effort) */
  text?: string;
  messageId?: string;
  usage?: EventUsage;
  metrics?: Record<string, unknown>;
  branch?: { name?: string; rootEventId?: string };
  /** the raw payload entry for the raw viewer */
  raw: unknown;
}

/**
 * Decode the double-encoded conversational payload (CLAUDE.md §3):
 * `conversational.content.text` is a JSON *string* containing
 * `{message: {role, content[], metadata: {usage, metrics}}, message_id, ...}`.
 * Falls back to the raw text when it isn't valid JSON.
 */
function decodeConversational(conv: Record<string, unknown>): {
  text?: string;
  messageId?: string;
  usage?: EventUsage;
  metrics?: Record<string, unknown>;
} {
  const content = isRecord(conv.content) ? conv.content : undefined;
  const rawText = content ? asString(content.text) : undefined;
  if (rawText === undefined) return {};

  let envelope: unknown;
  try {
    envelope = JSON.parse(rawText);
  } catch {
    // Not JSON — the text IS the content.
    return { text: rawText };
  }
  if (!isRecord(envelope)) return { text: rawText };

  const message = isRecord(envelope.message) ? envelope.message : undefined;
  const metadata =
    message && isRecord(message.metadata) ? message.metadata : undefined;

  // message.content is an array of blocks ({text} | {toolUse} | ...).
  let text: string | undefined;
  if (message && Array.isArray(message.content)) {
    const parts = message.content
      .map((b) => {
        if (!isRecord(b)) return undefined;
        if (typeof b.text === 'string') return b.text;
        if (isRecord(b.toolUse)) {
          const name = asString(b.toolUse.name) ?? 'tool';
          return `[tool_use: ${name}]`;
        }
        if (isRecord(b.toolResult) || 'toolResult' in b) return '[tool_result]';
        return undefined;
      })
      .filter((t): t is string => typeof t === 'string');
    if (parts.length) text = parts.join('\n');
  }
  if (text === undefined) text = rawText;

  const usageRaw = metadata && isRecord(metadata.usage) ? metadata.usage : undefined;
  const usage: EventUsage | undefined = usageRaw
    ? {
        inputTokens: asNumber(usageRaw.inputTokens),
        outputTokens: asNumber(usageRaw.outputTokens),
        totalTokens: asNumber(usageRaw.totalTokens),
      }
    : undefined;

  return {
    text,
    messageId: asString(envelope.message_id),
    usage,
    metrics:
      metadata && isRecord(metadata.metrics)
        ? (metadata.metrics as Record<string, unknown>)
        : undefined,
  };
}

/** Classify + decode one ListEvents `Event`. Never throws. */
export function parseEvent(event: unknown): ParsedEvent {
  const e = isRecord(event) ? event : {};
  const base: ParsedEvent = {
    eventId: asString(e.eventId) ?? '',
    timestamp: asDateString(e.eventTimestamp),
    type: 'unknown',
    branch: isRecord(e.branch)
      ? { name: asString(e.branch.name), rootEventId: asString(e.branch.rootEventId) }
      : undefined,
    raw: event,
  };

  const payload = Array.isArray(e.payload) ? e.payload : [];
  // A payload entry is a union: { conversational } | { blob }.
  for (const entry of payload) {
    if (!isRecord(entry)) continue;
    if (isRecord(entry.conversational)) {
      const conv = entry.conversational;
      const decoded = decodeConversational(conv);
      return {
        ...base,
        type: 'conversational',
        role: (asString(conv.role) ?? 'OTHER').toUpperCase(),
        text: decoded.text,
        messageId: decoded.messageId,
        usage: decoded.usage,
        metrics: decoded.metrics,
      };
    }
    if ('blob' in entry) {
      return { ...base, type: 'blob' };
    }
  }
  return base;
}

export function parseEvents(listOutput: unknown): {
  events: ParsedEvent[];
  nextToken?: string;
} {
  const out = isRecord(listOutput) ? listOutput : {};
  const events = Array.isArray(out.events) ? out.events.map(parseEvent) : [];
  return { events, nextToken: asString(out.nextToken) };
}

// ── Long-term memory: namespaces (SPEC §5.4) ────────────────────────────────

export interface NamespaceStrategy {
  strategyId: string;
  name: string;
  type?: string;
  status?: string;
  namespaces: string[];
}

/** Collect namespace strings from a strategy's nested override configs. */
function collectNamespaces(strategy: Record<string, unknown>): string[] {
  const found = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (!isRecord(v)) return;
    for (const [k, val] of Object.entries(v)) {
      if ((k === 'namespaces' || k === 'namespaceTemplates') && Array.isArray(val)) {
        for (const ns of val) if (typeof ns === 'string') found.add(ns);
      } else {
        walk(val);
      }
    }
  };
  walk(strategy.configuration);
  // Some shapes carry namespaces at the strategy top level.
  if (Array.isArray(strategy.namespaces)) {
    for (const ns of strategy.namespaces) if (typeof ns === 'string') found.add(ns);
  }
  return [...found];
}

/**
 * Parse GetMemory strategies. Falls back to the harness `retrievalConfig` shape
 * (namespace paths as keys, `strategyId` in values) when `strategies` is absent
 * (CLAUDE.md §3, SPEC §5.4).
 */
export function parseNamespaces(getMemoryOutput: unknown): NamespaceStrategy[] {
  const out = isRecord(getMemoryOutput) ? getMemoryOutput : {};
  const memory = isRecord(out.memory) ? out.memory : undefined;

  const strategies = memory && Array.isArray(memory.strategies)
    ? memory.strategies
    : undefined;

  if (strategies && strategies.length) {
    return strategies.flatMap((s): NamespaceStrategy[] => {
      if (!isRecord(s)) return [];
      const cfg = isRecord(s.configuration) ? s.configuration : undefined;
      return [
        {
          strategyId: asString(s.strategyId) ?? '',
          name: asString(s.name) ?? '(unnamed strategy)',
          type: cfg ? asString(cfg.type) : asString(s.type),
          status: asString(s.status),
          namespaces: collectNamespaces(s),
        },
      ];
    });
  }

  // Fallback: retrievalConfig map keyed by namespace path.
  const agentCore =
    memory && isRecord(memory.agentCoreMemoryConfiguration)
      ? memory.agentCoreMemoryConfiguration
      : undefined;
  const retrievalConfig =
    agentCore && isRecord(agentCore.retrievalConfig)
      ? agentCore.retrievalConfig
      : isRecord(out.retrievalConfig)
        ? out.retrievalConfig
        : undefined;
  if (retrievalConfig) {
    return Object.entries(retrievalConfig).map(([namespace, val]) => ({
      strategyId: isRecord(val) ? (asString(val.strategyId) ?? '') : '',
      name: namespace,
      type: undefined,
      status: undefined,
      namespaces: [namespace],
    }));
  }
  return [];
}

// ── Long-term memory: records (SPEC §5.4) ───────────────────────────────────

export interface MemoryRecord {
  memoryRecordId: string;
  text?: string;
  strategyId?: string;
  namespaces: string[];
  createdAt?: string;
  score?: number;
  raw: unknown;
}

export function parseMemoryRecords(output: unknown): {
  records: MemoryRecord[];
  nextToken?: string;
} {
  const out = isRecord(output) ? output : {};
  // Both ListMemoryRecords and RetrieveMemoryRecords return memoryRecordSummaries.
  const summaries = Array.isArray(out.memoryRecordSummaries)
    ? out.memoryRecordSummaries
    : [];
  const records = summaries.flatMap((r): MemoryRecord[] => {
    if (!isRecord(r)) return [];
    const content = isRecord(r.content) ? r.content : undefined;
    return [
      {
        memoryRecordId: asString(r.memoryRecordId) ?? '',
        text: content ? asString(content.text) : undefined,
        strategyId: asString(r.memoryStrategyId),
        namespaces: Array.isArray(r.namespaces)
          ? r.namespaces.filter((n): n is string => typeof n === 'string')
          : [],
        createdAt: asDateString(r.createdAt),
        score: asNumber(r.score),
        raw: r,
      },
    ];
  });
  return { records, nextToken: asString(out.nextToken) };
}

// ── Sessions (SPEC §5.3) ────────────────────────────────────────────────────

export interface SessionSummary {
  sessionId: string;
  actorId: string;
  createdAt?: string;
}

export function parseSessions(output: unknown): {
  sessions: SessionSummary[];
  nextToken?: string;
} {
  const out = isRecord(output) ? output : {};
  const summaries = Array.isArray(out.sessionSummaries)
    ? out.sessionSummaries
    : [];
  const sessions = summaries.flatMap((s): SessionSummary[] => {
    if (!isRecord(s)) return [];
    const sessionId = asString(s.sessionId);
    if (!sessionId) return [];
    return [
      {
        sessionId,
        actorId: asString(s.actorId) ?? '',
        createdAt: asDateString(s.createdAt),
      },
    ];
  });
  return { sessions, nextToken: asString(out.nextToken) };
}

/** Validate a resolved namespace is a plain path (no unresolved {braces}). */
export function isPlainNamespace(ns: string): boolean {
  return ns.length > 0 && !ns.includes('{') && !ns.includes('}');
}
