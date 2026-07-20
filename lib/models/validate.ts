import { z } from 'zod';
import { HARNESS_MODEL_CONFIGS } from './registry';
import type { HarnessModelConfig } from './types';

// Override validation built FROM the registry (SPEC §4.2). The client is never
// trusted: temperature is stripped/rejected for unsupported models, numeric
// values are clamped to registry ranges. Pure zod + registry — no AWS SDK.

export function getModelConfig(
  modelId: string
): HarnessModelConfig | undefined {
  return HARNESS_MODEL_CONFIGS.find((m) => m.modelId === modelId);
}

function clampedNumber(min: number, max: number): z.ZodTypeAny {
  // Clamp instead of reject so a slightly-stale client value survives a model
  // switch; the registry range is authoritative.
  return z.number().transform((v) => Math.min(Math.max(v, min), max));
}

/**
 * Validated, registry-gated overrides. Every field is optional; absent fields
 * mean "no override" → the harness default applies and nothing is sent
 * (SPEC §4.2, acceptance criteria §10).
 */
export interface ValidatedOverrides {
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface OverrideValidationResult {
  ok: boolean;
  overrides?: ValidatedOverrides;
  /** the resolved model config when a modelId override was supplied */
  model?: HarnessModelConfig;
  error?: string;
}

/**
 * Build a zod schema from the selected model's config and validate raw override
 * input. Temperature is only accepted when the model supports it; out-of-range
 * numerics are clamped. Unknown keys are rejected (strict object).
 *
 * `model` is the effective model for this invocation — the override modelId if
 * present, otherwise the harness default resolved by the caller. When no model
 * can be resolved, temperature cannot be gated, so it is rejected.
 */
export function validateOverrides(
  raw: unknown,
  effectiveModel: HarnessModelConfig | undefined
): OverrideValidationResult {
  const shape: Record<string, z.ZodTypeAny> = {
    modelId: z.string().min(1).optional(),
    systemPrompt: z.string().optional(),
  };

  if (effectiveModel) {
    shape.maxTokens = clampedNumber(
      effectiveModel.maxTokens.min,
      effectiveModel.maxTokens.max
    )
      .pipe(z.number().int())
      .optional();
    if (effectiveModel.temperature) {
      const t = effectiveModel.temperature;
      shape.temperature = clampedNumber(t.min, t.max).optional();
    } else {
      // Unsupported: reject a supplied temperature with a readable message.
      shape.temperature = z
        .undefined({
          error: `Temperature is not supported for ${effectiveModel.displayName}.`,
        })
        .optional();
    }
  } else {
    // No resolved model → accept maxTokens loosely, reject temperature.
    shape.maxTokens = z.number().int().positive().optional();
    shape.temperature = z
      .undefined({ error: 'Temperature requires a known model.' })
      .optional();
  }

  const parsed = z.strictObject(shape).safeParse(raw ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues
        .map((i) => `${i.path.join('.') || 'overrides'}: ${i.message}`)
        .join('; '),
    };
  }

  const overrides: ValidatedOverrides = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined && v !== null) {
      (overrides as Record<string, unknown>)[k] = v;
    }
  }
  return { ok: true, overrides, model: effectiveModel };
}
