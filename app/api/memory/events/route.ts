import { z } from 'zod';
import { defaultRegion, mapAwsError } from '@/lib/agentcore/clients';
import { listEvents } from '@/lib/agentcore/operations';

export const runtime = 'nodejs';

const querySchema = z.object({
  memoryId: z.string().min(1),
  sessionId: z.string().min(1),
  actorId: z.string().min(1),
  maxResults: z.coerce.number().int().min(1).max(100).optional(),
  nextToken: z.string().optional(),
  includePayloads: z.enum(['true', 'false']).optional(),
});

/** GET /api/memory/events — ListEvents with payload decoding (SPEC §5.3). */
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
  const { memoryId, sessionId, actorId, maxResults, nextToken, includePayloads } =
    parsed.data;

  try {
    const result = await listEvents(
      {
        memoryId,
        sessionId,
        actorId,
        includePayloads: includePayloads !== 'false',
        maxResults,
        nextToken,
      },
      defaultRegion()
    );
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: mapAwsError(err) }, { status: 502 });
  }
}
