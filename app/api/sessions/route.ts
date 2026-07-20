import { z } from 'zod';
import { defaultRegion, mapAwsError } from '@/lib/agentcore/clients';
import { listSessions } from '@/lib/agentcore/operations';

export const runtime = 'nodejs';

const querySchema = z.object({
  memoryId: z.string().min(1),
  actorId: z.string().min(1),
  hasEventsOnly: z.enum(['true', 'false']).optional(),
  maxResults: z.coerce.number().int().min(1).max(100).optional(),
  nextToken: z.string().optional(),
});

/** GET /api/sessions — ListSessions (SPEC §5.3). */
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
  const { memoryId, actorId, hasEventsOnly, maxResults, nextToken } = parsed.data;

  try {
    const result = await listSessions(
      {
        memoryId,
        actorId,
        hasEventsOnly: hasEventsOnly === 'true',
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
