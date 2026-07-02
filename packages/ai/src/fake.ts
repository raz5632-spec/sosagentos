import type { CompletionRequest, CompletionResult, ModelProvider } from "./provider.js";

/** Deterministic provider for tests and keyless environments (CI). */
export class FakeProvider implements ModelProvider {
  readonly code = "fake";
  readonly models = ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5"];

  constructor(private readonly opts: { failFirst?: number } = {}) {}

  private failures = 0;

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    if (this.opts.failFirst && this.failures < this.opts.failFirst) {
      this.failures++;
      throw new Error("fake provider transient failure");
    }
    return {
      text: `FAKE_COMPLETION for: ${req.prompt.slice(0, 80)}`,
      model: req.model,
      provider: this.code,
      stopReason: "end_turn",
      usage: { inputTokens: 100, outputTokens: 50, cachedInputTokens: 0 },
    };
  }
}
