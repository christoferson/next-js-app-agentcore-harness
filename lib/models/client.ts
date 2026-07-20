// Client-safe registry types + response shape (SPEC §5, §4). No server-only
// imports — the browser bundles this. Re-exports the pure types module.

export type { HarnessModelConfig, RangeSpec } from './types';
export { supportsTemperature } from './types';
import type { HarnessModelConfig } from './types';

export interface ModelsResponse {
  models: HarnessModelConfig[];
  defaultModelId: string;
}
