import { z } from 'zod';
import { defaultRegion } from '@/lib/agentcore/clients';
import { endSession } from '@/lib/agentcore/operations';

export const runtime = 'nodejs';

const bodySchema = z.object({ sessionId: z.string().min(1) });

/**
 * POST /api/sessions/end — best-effort EndSession (SPEC §5.3, CLAUDE.md §3).
 * Expired/not-found sessions return { ended: false, reason } with HTTP 200 —
 * the "New Session" flow must never fail on it.
 */
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json(
      { error: { code: 'InvalidJSON', message: 'Body must be JSON.' } },
      { status: 400 }
    );
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'InvalidRequest', message: 'Missing sessionId.' } },
      { status: 400 }
    );
  }

  // endSession never throws (best-effort); always 200.
  const result = await endSession(parsed.data.sessionId, defaultRegion());
  return Response.json(result);
}
