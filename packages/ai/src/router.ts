import type { CompletionRequest, CompletionResult, ModelProvider } from "./provider.js";

export type TaskClass = "reasoning" | "default" | "lightweight";

/** Model preference per task class, in failover order. */
const MODEL_RULES: Record<TaskClass, string[]> = {
  reasoning: ["claude-opus-4-8", "claude-sonnet-5"],
  default: ["claude-opus-4-8", "claude-sonnet-5"],
  lightweight: ["claude-haiku-4-5", "claude-sonnet-5"],
};

export interface RouteResult extends CompletionResult {
  failedOver: boolean;
  whyThisModel: string;
}

/**
 * Model Router agent (L0): picks provider+model per task class and fails over
 * after one provider failure — per docs/02-architecture/agent-catalog.md.
 */
export class ModelRouter {
  constructor(private readonly providers: ModelProvider[]) {
    if (providers.length === 0) throw new Error("ModelRouter requires at least one provider");
  }

  candidates(taskClass: TaskClass): Array<{ provider: ModelProvider; model: string }> {
    const out: Array<{ provider: ModelProvider; model: string }> = [];
    for (const model of MODEL_RULES[taskClass]) {
      for (const provider of this.providers) {
        if (provider.models.includes(model)) out.push({ provider, model });
      }
    }
    // Any provider is better than none: append remaining provider defaults.
    for (const provider of this.providers) {
      if (!out.some((c) => c.provider === provider)) {
        out.push({ provider, model: provider.models[0] });
      }
    }
    return out;
  }

  async complete(
    taskClass: TaskClass,
    req: Omit<CompletionRequest, "model">,
  ): Promise<RouteResult> {
    const candidates = this.candidates(taskClass);
    let lastError: unknown;
    for (let i = 0; i < candidates.length; i++) {
      const { provider, model } = candidates[i];
      try {
        const result = await provider.complete({ ...req, model });
        return {
          ...result,
          failedOver: i > 0,
          whyThisModel: `task_class=${taskClass}; rule order ${i + 1}/${candidates.length}${i > 0 ? "; failover after provider failure" : ""}`,
        };
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(`all providers failed for task_class=${taskClass}: ${String(lastError)}`);
  }
}
