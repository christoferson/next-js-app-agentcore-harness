import 'server-only';
import {
  ListHarnessesCommand,
  GetHarnessCommand,
  GetMemoryCommand,
} from '@aws-sdk/client-bedrock-agentcore-control';
import {
  ListSessionsCommand,
  ListEventsCommand,
  ListMemoryRecordsCommand,
  RetrieveMemoryRecordsCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import { EndSessionCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { clientsFor, isExpiredSessionError, mapAwsError } from './clients';
import {
  parseHarnessSummaries,
  parseHarnessDetails,
  parseNamespaces,
  parseEvents,
  parseMemoryRecords,
  parseSessions,
  type HarnessSummary,
  type HarnessDetails,
  type NamespaceStrategy,
  type ParsedEvent,
  type MemoryRecord,
  type SessionSummary,
} from './parsers';

// Non-streaming AgentCore operations. Route handlers call these — they never
// import the SDK directly (CLAUDE.md §4/§7 layering). Each returns parsed data;
// AWS errors propagate (mapped by callers via mapAwsError) unless noted.
//
// Streaming operations live in invoke.ts (chat) and command.ts (run command).

/**
 * Opt-in raw-payload debug dump (CLAUDE.md §4: full dumps only at DEBUG). Set
 * AGENTCORE_DEBUG_STREAM=1 to capture raw AWS response shapes (e.g. the memory
 * ListEvents tool-result / citation shape) for verification. Off by default.
 */
const OPS_DEBUG = process.env.AGENTCORE_DEBUG_STREAM === '1';

function debugRaw(label: string, value: unknown): void {
  if (!OPS_DEBUG) return;
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    json = '<unserializable>';
  }
  if (json.length > 40000) json = json.slice(0, 40000) + `…<truncated ${json.length} chars>`;
  console.debug(`[ops:raw ${label}] ${json}`);
}

export async function listHarnesses(region?: string): Promise<HarnessSummary[]> {
  const { control } = clientsFor(region);
  const all: HarnessSummary[] = [];
  let nextToken: string | undefined;
  do {
    const out = await control.send(
      new ListHarnessesCommand({ maxResults: 100, nextToken })
    );
    all.push(...parseHarnessSummaries(out));
    nextToken = out.nextToken;
  } while (nextToken);
  return all;
}

export async function getHarness(
  id: string,
  region?: string
): Promise<HarnessDetails> {
  const { control } = clientsFor(region);
  const out = await control.send(new GetHarnessCommand({ harnessId: id }));
  return parseHarnessDetails(out);
}

export async function getMemoryNamespaces(
  memoryId: string,
  region?: string
): Promise<NamespaceStrategy[]> {
  const { control } = clientsFor(region);
  const out = await control.send(new GetMemoryCommand({ memoryId }));
  return parseNamespaces(out);
}

export async function listSessions(
  params: {
    memoryId: string;
    actorId: string;
    hasEventsOnly?: boolean;
    maxResults?: number;
    nextToken?: string;
  },
  region?: string
): Promise<{ sessions: SessionSummary[]; nextToken?: string }> {
  const { data } = clientsFor(region);
  const out = await data.send(
    new ListSessionsCommand({
      memoryId: params.memoryId,
      actorId: params.actorId,
      maxResults: params.maxResults ?? 50,
      nextToken: params.nextToken,
      filter: params.hasEventsOnly ? { eventFilter: 'HAS_EVENTS' } : undefined,
    })
  );
  return parseSessions(out);
}

export async function listEvents(
  params: {
    memoryId: string;
    sessionId: string;
    actorId: string;
    includePayloads?: boolean;
    maxResults?: number;
    nextToken?: string;
  },
  region?: string
): Promise<{ events: ParsedEvent[]; nextToken?: string }> {
  const { data } = clientsFor(region);
  const out = await data.send(
    new ListEventsCommand({
      memoryId: params.memoryId,
      sessionId: params.sessionId,
      actorId: params.actorId,
      includePayloads: params.includePayloads ?? true,
      maxResults: params.maxResults ?? 50,
      nextToken: params.nextToken,
    })
  );
  debugRaw('ListEvents', out);
  return parseEvents(out);
}

export async function listOrSearchRecords(
  params: {
    memoryId: string;
    namespace: string;
    query?: string;
    maxResults?: number;
    nextToken?: string;
  },
  region?: string
): Promise<{ records: MemoryRecord[]; nextToken?: string }> {
  const { data } = clientsFor(region);
  const q = params.query?.trim();
  const out = q
    ? await data.send(
        new RetrieveMemoryRecordsCommand({
          memoryId: params.memoryId,
          namespace: params.namespace,
          searchCriteria: { searchQuery: q, topK: params.maxResults ?? 20 },
          maxResults: params.maxResults ?? 20,
          nextToken: params.nextToken,
        })
      )
    : await data.send(
        new ListMemoryRecordsCommand({
          memoryId: params.memoryId,
          namespace: params.namespace,
          maxResults: params.maxResults ?? 50,
          nextToken: params.nextToken,
        })
      );
  return parseMemoryRecords(out);
}

/**
 * Best-effort EndSession (SPEC §5.3). Never throws — expired/not-found sessions
 * return { ended: false, reason }. The SDK input field is `sessionIdentifier`.
 */
export async function endSession(
  sessionId: string,
  region?: string
): Promise<{ ended: boolean; status?: string; reason?: string }> {
  const { agentRuntime } = clientsFor(region);
  try {
    const out = await agentRuntime.send(
      new EndSessionCommand({ sessionIdentifier: sessionId })
    );
    return { ended: true, status: out.sessionStatus };
  } catch (err) {
    // Expired or otherwise — surface the reason but never fail the flow.
    void isExpiredSessionError(err);
    return { ended: false, reason: mapAwsError(err).message };
  }
}
