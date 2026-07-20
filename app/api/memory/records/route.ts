import { z } from 'zod';
import { defaultRegion, mapAwsError } from '@/lib/agentcore/clients';
import { listOrSearchRecords } from '@/lib/agentcore/operations';
import { isPlainNamespace } from '@/lib/agentcore/parsers';

export const runtime = 'nodejs';

const querySchema = z.object({
  memoryId: z.string().min(1),
  namespace: z.string().min(1),
  query: z.string().optional(),
  maxResults: z.coerce.number().int().min(1).max(100).optional(),
  nextToken: z.string().optional(),
});

/**
 * GET /api/memory/records — RetrieveMemoryRecords when `query` present, else
 * ListMemoryRecords (SPEC §5.4). SPEC called the search op "QueryMemory"; the
 * real SDK command is RetrieveMemoryRecords (see aws/docs/_manifest.md). The
 * server validates the resolved namespace is a plain path (no {braces}).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return Response.json(
      {
        error: {
          code: 'InvalidRequest',
          message: parsed.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; '),
        },
      },
      { status: 400 }
    );
  }
  const { memoryId, namespace, query, maxResults, nextToken } = parsed.data;

  if (!isPlainNamespace(namespace)) {
    return Response.json(
      {
        error: {
          code: 'InvalidNamespace',
          message: 'Namespace contains unresolved template placeholders ({...}).',
        },
      },
      { status: 400 }
    );
  }

  try {
    const result = await listOrSearchRecords(
      { memoryId, namespace, query, maxResults, nextToken },
      defaultRegion()
    );
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: mapAwsError(err) }, { status: 502 });
  }
}
