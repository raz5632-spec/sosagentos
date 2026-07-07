import Anthropic from "@anthropic-ai/sdk";
import type { CompletionRequest, CompletionResult, ModelProvider } from "./provider.js";

export class AnthropicProvider implements ModelProvider {
  readonly code = "anthropic";
  readonly models = ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5"];

  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic(apiKey ? { apiKey } : undefined);
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    // Vision: prepend image blocks before the text prompt when present.
    const content: Anthropic.ContentBlockParam[] = [];
    for (const img of req.images ?? []) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: img.base64,
        },
      });
    }
    content.push({ type: "text", text: req.prompt });

    const response = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens ?? 4096,
      system: req.system,
      messages: [{ role: "user", content }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    return {
      text,
      model: response.model,
      provider: this.code,
      stopReason: response.stop_reason,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cachedInputTokens: response.usage.cache_read_input_tokens ?? 0,
      },
    };
  }
}
