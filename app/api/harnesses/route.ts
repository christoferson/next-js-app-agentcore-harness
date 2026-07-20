import { defaultRegion, mapAwsError } from '@/lib/agentcore/clients';
import { listHarnesses } from '@/lib/agentcore/operations';
import type { HarnessSummary } from '@/lib/agentcore/parsers';

export const runtime = 'nodejs';

// Server-side cache with 5-min TTL (SPEC §2, §5.1). `?refresh=1` busts it.
interface CacheEntry {
  at: number;
  data: HarnessSummary[];
}
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get('refresh') === '1';
  const region = defaultRegion();

  const cached = cache.get(region);
  if (!refresh && cached && Date.now() - cached.at < TTL_MS) {
    return Response.json({ harnesses: cached.data, cached: true });
  }

  try {
    const harnesses = await listHarnesses(region);
    cache.set(region, { at: Date.now(), data: harnesses });
    return Response.json({ harnesses, cached: false });
  } catch (err) {
    return Response.json({ error: mapAwsError(err) }, { status: 502 });
  }
}
