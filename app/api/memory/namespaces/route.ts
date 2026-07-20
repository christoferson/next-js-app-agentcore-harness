import { z } from 'zod';
import { defaultRegion, mapAwsError } from '@/lib/agentcore/clients';
import { getMemoryNamespaces } from '@/lib/agentcore/operations';

export const runtime = 'nodejs';

const querySchema = z.object({ memoryId: z.string().min(1) });

/** GET /api/memory/namespaces — GetMemory strategies (SPEC §5.4). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'InvalidRequest', message: 'Missing memoryId.' } },
      { status: 400 }
    );
  }

  try {
    const strategies = await getMemoryNamespaces(
      parsed.data.memoryId,
      defaultRegion()
    );
    return Response.json({ strategies });
  } catch (err) {
    return Response.json({ error: mapAwsError(err) }, { status: 502 });
  }
}
