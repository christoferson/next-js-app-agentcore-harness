import { DEFAULT_MODEL_ID, HARNESS_MODEL_CONFIGS } from '@/lib/models/registry';
import type { ModelsResponse } from '@/lib/models/client';

export const runtime = 'nodejs';

/** GET /api/models — client-safe model registry (SPEC §5). Pure data, no AWS. */
export async function GET() {
  const body: ModelsResponse = {
    models: HARNESS_MODEL_CONFIGS,
    defaultModelId: DEFAULT_MODEL_ID,
  };
  return Response.json(body);
}
