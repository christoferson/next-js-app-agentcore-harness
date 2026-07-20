// Model Config Registry types (SPEC §4.1).
//
// Overridable model behavior — which inference params a model supports, their
// defaults/ranges — is modeled as typed metadata. All model-specific behavior
// (UI controls shown, request fields sent, server-side validation) is driven by
// this registry. Adding a model = one registry entry (SPEC §4.2).
//
// This module is pure data-shape + helpers. It MUST NOT import the AWS SDK or
// React (CLAUDE.md §4).

/** A numeric override the UI may expose and the server may forward. */
export interface RangeSpec {
  default: number;
  min: number;
  max: number;
  step: number;
}

export interface HarnessModelConfig {
  /** e.g. "global.anthropic.claude-sonnet-4-6" */
  modelId: string;
  displayName: string;
  provider: string;
  description?: string;
  /**
   * Present = temperature is supported (control shown, value may be sent).
   * Absent = never shown, never sent (SPEC §4.1/§4.2).
   */
  temperature?: RangeSpec;
  /**
   * Max output tokens — always overridable. The effective default comes from
   * the harness-configured maxTokens, falling back to `fallbackDefault`.
   */
  maxTokens: {
    min: number;
    max: number;
    step: number;
    fallbackDefault: number;
  };
  /**
   * Override when the model isn't available in the default region. Informational
   * for the harness console (the harness owns the actual model binding), but
   * surfaced in the client-safe registry for display.
   */
  region?: string;
  contextWindowTokens?: number;
  /** quirks, verification status — displayed, never branched on. */
  notes?: string[];
}

/** Does this model support a temperature override? */
export function supportsTemperature(m: HarnessModelConfig): boolean {
  return m.temperature !== undefined;
}
