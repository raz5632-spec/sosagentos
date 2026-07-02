import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { AcpMessage, confidencePolicy } from "../src/acp.js";

const base = {
  messageId: randomUUID(),
  taskId: "TASK-KG-004",
  tenantId: "org_sos",
  sourceAgent: "supreme_orchestrator",
  targetAgent: "knowledge_curator",
  requestedBy: "ceo_interface",
  approvalLevel: "L2" as const,
  objective: "Promote validated lesson insight into production knowledge",
};

describe("AcpMessage schema", () => {
  it("parses a minimal valid message with defaults", () => {
    const msg = AcpMessage.parse(base);
    expect(msg.status).toBe("created");
    expect(msg.priority).toBe("medium");
    expect(msg.requiredConfidence).toBe(0.9);
    expect(msg.constraints.maxRetries).toBe(2);
  });

  it("rejects a message without an objective", () => {
    expect(() => AcpMessage.parse({ ...base, objective: "" })).toThrow();
  });

  it("rejects an invalid approval level", () => {
    expect(() => AcpMessage.parse({ ...base, approvalLevel: "L9" })).toThrow();
  });

  it("rejects an invalid status transition value", () => {
    expect(() => AcpMessage.parse({ ...base, status: "done" })).toThrow();
  });
});

describe("confidencePolicy", () => {
  it("maps bands per the spec", () => {
    expect(confidencePolicy(0.95)).toBe("execute");
    expect(confidencePolicy(0.9)).toBe("execute");
    expect(confidencePolicy(0.8)).toBe("qa_review");
    expect(confidencePolicy(0.65)).toBe("gather_more");
    expect(confidencePolicy(0.4)).toBe("escalate");
  });
});
