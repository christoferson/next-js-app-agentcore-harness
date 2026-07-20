import { defaultRegion, mapAwsError } from '@/lib/agentcore/clients';
import { getHarness } from '@/lib/agentcore/operations';

export const runtime = 'nodejs';

// GET /api/harnesses/[id] → GetHarness; returns parsed details + raw (SPEC §5.1).
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id) {
    return Response.json(
      { error: { code: 'InvalidRequest', message: 'Missing harness id.' } },
      { status: 400 }
    );
  }

  try {
    const harness = await getHarness(id, defaultRegion());
    return Response.json({ harness });
  } catch (err) {
    const mapped = mapAwsError(err);
    const status = mapped.code === 'ResourceNotFoundException' ? 404 : 502;
    return Response.json({ error: mapped }, { status });
  }
}
