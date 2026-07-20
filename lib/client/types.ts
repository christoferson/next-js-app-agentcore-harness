// Shared client-facing API response types (mirror the route handlers). Safe to
// import in client components — no server-only or AWS SDK imports.

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
  memoryId: string | null;
  memoryArn: string | null;
  memoryShape: "agentCore" | "managed" | "disabled" | "none";
  agentRuntimeArn: string | null;
  model: HarnessModelDefaults;
  systemPrompt: string;
  maxIterations?: number;
  maxTokens?: number;
  timeoutSeconds?: number;
  createdAt?: string;
  updatedAt?: string;
  raw: unknown;
}

export interface ToolBlock {
  kind: "use" | "result";
  name?: string;
  toolUseId?: string;
  input?: unknown;
  content?: string;
  status?: string;
}

export interface ParsedEvent {
  eventId: string;
  timestamp?: string;
  type: "conversational" | "blob" | "unknown";
  role?: string;
  text?: string;
  tools?: ToolBlock[];
  messageId?: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  metrics?: Record<string, unknown>;
  branch?: { name?: string; rootEventId?: string };
  raw: unknown;
}

export interface NamespaceStrategy {
  strategyId: string;
  name: string;
  type?: string;
  status?: string;
  namespaces: string[];
}

export interface MemoryRecord {
  memoryRecordId: string;
  text?: string;
  strategyId?: string;
  namespaces: string[];
  createdAt?: string;
  score?: number;
  raw: unknown;
}

export interface SessionSummary {
  sessionId: string;
  actorId: string;
  createdAt?: string;
}

export interface ApiError {
  code: string;
  message: string;
}

/** Runtime overrides applied per invocation (SPEC §5.2). */
export interface Overrides {
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}
