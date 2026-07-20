import type { HarnessModelConfig } from './types';

// Seed registry (SPEC §4.3). Data-only — helpers live in types.ts / validate.ts.
//
// IMPORTANT (CLAUDE.md §1): these IDs and capability flags are the *intended*
// lineup, not live-verified in an account this session. The temperature-support
// flags below follow the SPEC §4.3 expected shapes, corroborated by the live
// Bedrock Converse verification recorded in aws/docs/bedrock-models/anthropic-claude.md
// (2026-07-13): Bedrock REJECTS temperature for Claude 5-generation and Opus 4.8
// models ("`temperature` is deprecated for this model"). Sonnet 4.6 retains it.
//
// If any ID fails to invoke against a real harness, flag it — do not guess
// (CLAUDE.md §8).

const MAX_TOKENS_128K = {
  min: 1,
  max: 128_000,
  step: 1,
  fallbackDefault: 4096,
} as const;

export const HARNESS_MODEL_CONFIGS: HarnessModelConfig[] = [
  {
    modelId: 'global.anthropic.claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    provider: 'Anthropic',
    description:
      'Balanced Sonnet-generation model for coding and agents; supports temperature.',
    contextWindowTokens: 1_000_000,
    // Temperature SUPPORTED (SPEC §4.3 default 0.1).
    temperature: { default: 0.1, min: 0, max: 1, step: 0.05 },
    maxTokens: MAX_TOKENS_128K,
    notes: [
      'Default temperature 0.1 (SPEC §4.3).',
      'Model ID from SPEC §4.3 — verify invocable against your harness.',
    ],
  },
  {
    modelId: 'global.anthropic.claude-sonnet-5',
    displayName: 'Claude Sonnet 5',
    provider: 'Anthropic',
    description:
      'Near-Opus intelligence for coding, agents, and professional work at scale.',
    contextWindowTokens: 1_000_000,
    // Temperature NOT supported — Bedrock rejects it for Claude 5-gen models
    // ("temperature is deprecated for this model"), verified live 2026-07-13
    // (aws/docs/bedrock-models/anthropic-claude.md). No `temperature` key.
    maxTokens: MAX_TOKENS_128K,
    notes: [
      'Temperature not supported: Bedrock rejects it for Claude 5-generation models (verified live 2026-07-13).',
      'Adaptive thinking is always on and cannot be disabled.',
    ],
  },
  {
    modelId: 'global.anthropic.claude-opus-4-8',
    displayName: 'Claude Opus 4.8',
    provider: 'Anthropic',
    description:
      'Opus model optimized for coding, agents, and deeper reasoning in enterprise workflows.',
    contextWindowTokens: 1_000_000,
    // Temperature NOT supported — same restriction as the Claude 5 generation
    // (rejected by Bedrock, verified live 2026-07-13).
    maxTokens: MAX_TOKENS_128K,
    notes: [
      'Temperature not supported: rejected by Bedrock ("deprecated for this model"), verified live 2026-07-13.',
    ],
  },
];

/** The default model selection when the harness config exposes none. */
export const DEFAULT_MODEL_ID = 'global.anthropic.claude-sonnet-4-6';
