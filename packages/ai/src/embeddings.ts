// Embedding provider abstraction — see docs/adr/ADR-2026-07-02-hash-embeddings-v1.md
import { createHash } from "node:crypto";

export const EMBEDDING_DIM = 1536;

export interface EmbeddingProvider {
  readonly code: string;
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * Deterministic local embeddings via token feature hashing (bag-of-words cosine).
 * v1 stand-in until a semantic provider key exists; same dim as common providers.
 */
export class HashingEmbeddingProvider implements EmbeddingProvider {
  readonly code = "hashing-v1";

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedOne(t));
  }

  private embedOne(text: string): number[] {
    const vec = new Float64Array(EMBEDDING_DIM);
    const tokens = text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length > 1);
    for (const token of tokens) {
      const digest = createHash("sha256").update(token).digest();
      const idx = digest.readUInt32BE(0) % EMBEDDING_DIM;
      const sign = digest[4] % 2 === 0 ? 1 : -1;
      vec[idx] += sign;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return Array.from(vec, (v) => v / norm);
  }
}

/** pgvector literal, e.g. "[0.1,0,-0.2,...]" */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.map((v) => Number(v.toFixed(6))).join(",")}]`;
}
