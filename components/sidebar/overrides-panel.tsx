"use client";

import { RotateCcwIcon } from "lucide-react";
import {
  supportsTemperature,
  type HarnessModelConfig,
} from "@/lib/models/client";
import type { Overrides } from "@/lib/client/types";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Overrides panel — every control is registry-gated (SPEC §4.2, §6). Temperature
// appears ONLY when the selected model supports it; otherwise an amber hint.
export interface OverrideState {
  modelOn: boolean;
  modelId: string;
  tempOn: boolean;
  temperature: number;
  maxTokensOn: boolean;
  maxTokens: number;
  systemPromptOn: boolean;
  systemPrompt: string;
}

export function buildOverrides(s: OverrideState): Overrides {
  const o: Overrides = {};
  if (s.modelOn && s.modelId) o.modelId = s.modelId;
  if (s.tempOn) o.temperature = s.temperature;
  if (s.maxTokensOn) o.maxTokens = s.maxTokens;
  if (s.systemPromptOn && s.systemPrompt.trim()) o.systemPrompt = s.systemPrompt;
  return o;
}

export function OverridesPanel({
  models,
  state,
  setState,
  configuredSystemPrompt,
}: {
  models: HarnessModelConfig[];
  state: OverrideState;
  setState: (updater: (s: OverrideState) => OverrideState) => void;
  configuredSystemPrompt: string;
}) {
  // The effective model gates temperature: the override model when enabled,
  // else undefined (we don't know the harness default's registry entry).
  const selected = state.modelOn
    ? models.find((m) => m.modelId === state.modelId)
    : undefined;
  const tempSupported = selected ? supportsTemperature(selected) : false;

  return (
    <div className="space-y-4">
      {/* Model */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Model override</Label>
          <Switch
            checked={state.modelOn}
            onCheckedChange={(v) => setState((s) => ({ ...s, modelOn: v }))}
          />
        </div>
        {state.modelOn && (
          <Select
            value={state.modelId}
            onValueChange={(v) =>
              setState((s) => ({ ...s, modelId: v ?? s.modelId }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.modelId} value={m.modelId}>
                  {m.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Temperature (registry-gated) */}
      {state.modelOn && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Temperature</Label>
            {tempSupported ? (
              <Switch
                checked={state.tempOn}
                onCheckedChange={(v) => setState((s) => ({ ...s, tempOn: v }))}
              />
            ) : (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400">
                not supported
              </span>
            )}
          </div>
          {tempSupported && state.tempOn && selected?.temperature && (
            <div className="flex items-center gap-2">
              <Slider
                min={selected.temperature.min}
                max={selected.temperature.max}
                step={selected.temperature.step}
                value={[state.temperature]}
                onValueChange={(v) =>
                  setState((s) => ({
                    ...s,
                    temperature: Array.isArray(v) ? (v[0] ?? s.temperature) : v,
                  }))
                }
                className="flex-1"
              />
              <span className="w-9 text-right font-mono text-xs tabular-nums">
                {state.temperature.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Max tokens */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Max tokens</Label>
          <Switch
            checked={state.maxTokensOn}
            onCheckedChange={(v) => setState((s) => ({ ...s, maxTokensOn: v }))}
          />
        </div>
        {state.maxTokensOn && (
          <Input
            type="number"
            value={state.maxTokens}
            min={1}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                maxTokens: Number(e.target.value) || s.maxTokens,
              }))
            }
            className="h-7 font-mono text-xs tabular-nums"
          />
        )}
      </div>

      {/* System prompt */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">System prompt override</Label>
          <Switch
            checked={state.systemPromptOn}
            onCheckedChange={(v) =>
              setState((s) => ({ ...s, systemPromptOn: v }))
            }
          />
        </div>
        {state.systemPromptOn && (
          <div className="space-y-1">
            <textarea
              value={state.systemPrompt}
              onChange={(e) =>
                setState((s) => ({ ...s, systemPrompt: e.target.value }))
              }
              rows={4}
              className="w-full resize-y rounded-lg border border-input bg-transparent px-2 py-1.5 text-xs outline-none focus-visible:border-ring dark:bg-input/30"
              placeholder="Override the harness system prompt…"
            />
            <button
              type="button"
              onClick={() =>
                setState((s) => ({ ...s, systemPrompt: configuredSystemPrompt }))
              }
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            >
              <RotateCcwIcon className="size-2.5" />
              Reset to configured
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
