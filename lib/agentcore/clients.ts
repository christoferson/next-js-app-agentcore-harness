import 'server-only';
import { BedrockAgentCoreControlClient } from '@aws-sdk/client-bedrock-agentcore-control';
import { BedrockAgentCoreClient } from '@aws-sdk/client-bedrock-agentcore';
import { BedrockAgentRuntimeClient } from '@aws-sdk/client-bedrock-agent-runtime';

// Thin SDK client factory + AWS error mapping ONLY (CLAUDE.md §4). No parsing,
// no business logic. Clients are cached per region (SPEC §9 multi-region seam:
// clientsFor(region)). Credentials come from the default provider chain
// (AWS_PROFILE / SSO).

export function defaultRegion(): string {
  return process.env.AWS_REGION ?? 'us-east-1';
}

interface RegionClients {
  control: BedrockAgentCoreControlClient;
  data: BedrockAgentCoreClient;
  agentRuntime: BedrockAgentRuntimeClient;
}

const cache = new Map<string, RegionClients>();

export function clientsFor(region: string = defaultRegion()): RegionClients {
  let clients = cache.get(region);
  if (!clients) {
    clients = {
      control: new BedrockAgentCoreControlClient({ region }),
      data: new BedrockAgentCoreClient({ region }),
      agentRuntime: new BedrockAgentRuntimeClient({ region }),
    };
    cache.set(region, clients);
  }
  return clients;
}

export interface MappedError {
  code: string;
  message: string;
}

/**
 * Map a request-level AWS SDK error to a structured, user-readable error
 * (CLAUDE.md §4). Route handlers translate `code` to an HTTP status or SSE
 * `error` event. In-stream exception events are mapped separately by the
 * stream adapters (they carry their own shapes).
 */
export function mapAwsError(err: unknown): MappedError {
  const name = (err as { name?: string })?.name ?? 'UnknownError';
  const raw = (err as { message?: string })?.message;

  switch (name) {
    case 'AccessDeniedException':
      return {
        code: name,
        message:
          'Access denied — enable Bedrock AgentCore access and check your IAM permissions (AgentCore control + data plane, bedrock-agent-runtime:EndSession).',
      };
    case 'ThrottlingException':
      return { code: name, message: 'Request throttled — retry shortly.' };
    case 'ValidationException':
    case 'InvalidInputException':
      return {
        code: name,
        message: raw ?? 'The request was rejected by AgentCore validation.',
      };
    case 'ResourceNotFoundException':
      return {
        code: name,
        message:
          'Resource not found — it may not exist in this region or has been deleted.',
      };
    case 'ServiceQuotaExceededException':
      return {
        code: name,
        message: 'Service quota exceeded — reduce request rate or request an increase.',
      };
    case 'ConflictException':
      return {
        code: name,
        message: raw ?? 'The operation conflicted with the resource state.',
      };
    case 'ServiceException':
    case 'InternalServerException':
    case 'ServiceUnavailableException':
      return { code: name, message: 'AgentCore service error — try again.' };
    case 'CredentialsProviderError':
    case 'ExpiredTokenException':
    case 'ExpiredToken':
      return {
        code: name,
        message:
          'AWS credentials missing or expired — run `aws sso login` (AWS_PROFILE) and retry.',
      };
    default:
      return {
        code: name,
        message: raw ?? 'Unexpected error calling AgentCore.',
      };
  }
}

/** True when an error looks like an already-expired / not-found session, which
 *  the best-effort EndSession flow must tolerate (SPEC §5.3, CLAUDE.md §3). */
export function isExpiredSessionError(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? '';
  const msg = ((err as { message?: string })?.message ?? '').toLowerCase();
  return (
    name === 'ResourceNotFoundException' ||
    name === 'ConflictException' ||
    msg.includes('expired') ||
    msg.includes('not found') ||
    msg.includes('already ended')
  );
}
