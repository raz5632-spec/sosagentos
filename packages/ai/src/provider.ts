// Provider adapter contract. Business logic never couples to provider-specific
// objects — see docs/05-integrations/llm-providers.md.

export interface ImageInput {
  mediaType: string; // e.g. "image/jpeg", "image/png"
  base64: string;
}

export interface CompletionRequest {
  model: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
  /** Optional images for vision-capable models (Claude). */
  images?: ImageInput[];
}

export interface CompletionUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  provider: string;
  stopReason: string | null;
  usage: CompletionUsage;
}

export interface ModelProvider {
  readonly code: string;
  /** Model ids this provider can serve, in preference order. */
  readonly models: string[];
  complete(req: CompletionRequest): Promise<CompletionResult>;
}
