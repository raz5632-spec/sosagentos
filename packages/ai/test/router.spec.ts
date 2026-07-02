import { describe, expect, it } from "vitest";
import { FakeProvider } from "../src/fake.js";
import { ModelRouter } from "../src/router.js";
import { estimateCostUsd } from "../src/pricing.js";

describe("ModelRouter", () => {
  it("routes lightweight tasks to haiku", async () => {
    const router = new ModelRouter([new FakeProvider()]);
    const res = await router.complete("lightweight", { prompt: "classify this" });
    expect(res.model).toBe("claude-haiku-4-5");
    expect(res.failedOver).toBe(false);
  });

  it("routes default tasks to opus", async () => {
    const router = new ModelRouter([new FakeProvider()]);
    const res = await router.complete("default", { prompt: "plan something" });
    expect(res.model).toBe("claude-opus-4-8");
  });

  it("fails over to the next candidate after one provider failure", async () => {
    const flaky = new FakeProvider({ failFirst: 1 });
    const router = new ModelRouter([flaky]);
    const res = await router.complete("default", { prompt: "x" });
    expect(res.failedOver).toBe(true);
    expect(res.model).toBe("claude-sonnet-5");
  });

  it("throws when all candidates fail", async () => {
    const dead = new FakeProvider({ failFirst: 100 });
    const router = new ModelRouter([dead]);
    await expect(router.complete("default", { prompt: "x" })).rejects.toThrow(/all providers failed/);
  });
});

describe("estimateCostUsd", () => {
  it("prices opus usage correctly", () => {
    const cost = estimateCostUsd("claude-opus-4-8", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cachedInputTokens: 0,
    });
    expect(cost).toBe(30.0); // $5 in + $25 out
  });

  it("returns 0 for unknown models", () => {
    expect(estimateCostUsd("gpt-x", { inputTokens: 10, outputTokens: 10, cachedInputTokens: 0 })).toBe(0);
  });
});

describe("estimateCostUsd dated model ids", () => {
  it("prefix-matches dated full ids", () => {
    const cost = estimateCostUsd("claude-haiku-4-5-20251001", {
      inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 0,
    });
    expect(cost).toBe(1.0);
  });
});
