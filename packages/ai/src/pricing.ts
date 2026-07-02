// USD per 1M tokens. Source: Claude API docs (cached 2026-06). Update on model launches.
interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cachedInputPerMTok: number; // cache reads ≈ 0.1x input
}

const PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-8": { inputPerMTok: 5.0, outputPerMTok: 25.0, cachedInputPerMTok: 0.5 },
  "claude-sonnet-5": { inputPerMTok: 3.0, outputPerMTok: 15.0, cachedInputPerMTok: 0.3 },
  "claude-haiku-4-5": { inputPerMTok: 1.0, outputPerMTok: 5.0, cachedInputPerMTok: 0.1 },
};

export function estimateCostUsd(
  model: string,
  usage: { inputTokens: number; outputTokens: number; cachedInputTokens: number },
): number {
  // The API may return dated full ids (e.g. claude-haiku-4-5-20251001) — prefix-match aliases.
  const key = Object.keys(PRICING).find((k) => model === k || model.startsWith(k + "-"));
  const p = key ? PRICING[key] : undefined;
  if (!p) return 0;
  return (
    (usage.inputTokens / 1_000_000) * p.inputPerMTok +
    (usage.outputTokens / 1_000_000) * p.outputPerMTok +
    (usage.cachedInputTokens / 1_000_000) * p.cachedInputPerMTok
  );
}
