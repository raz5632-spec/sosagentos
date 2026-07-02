import { describe, expect, it, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "@salesos/db";
import { FakeProvider } from "../src/fake.js";
import { ModelRouter } from "../src/router.js";
import { AgentRuntime } from "../src/runtime.js";

// Requires the local dev database (docker compose up + migrate + seed).
let orgId: string;

const baseMsg = () => ({
  messageId: randomUUID(),
  taskId: "TASK-TEST-001",
  tenantId: orgId,
  sourceAgent: "supreme_orchestrator",
  targetAgent: "analytics",
  requestedBy: "system",
  approvalLevel: "L1" as const,
  objective: "Summarize the weekly KPI snapshot",
});

describe("AgentRuntime", () => {
  beforeAll(async () => {
    const org = await getDb().organization.findUniqueOrThrow({ where: { slug: "sos" } });
    orgId = org.id;
  });

  it("executes an L1 task and records invocation + audit", async () => {
    const runtime = new AgentRuntime(new ModelRouter([new FakeProvider()]));
    const result = await runtime.dispatch(baseMsg());
    expect(result.status).toBe("completed");
    expect((result.output as { text: string }).text).toContain("FAKE_COMPLETION");
    expect(result.audit.costEstimateUsd).toBeGreaterThan(0);

    const db = getDb();
    const invocation = await db.modelInvocation.findFirst({
      orderBy: { createdAt: "desc" },
      include: { agent: true },
    });
    expect(invocation?.agent.code).toBe("analytics");

    const audit = await db.auditEvent.findFirst({
      where: { action: "acp.completed", subjectId: result.messageId },
    });
    expect(audit).toBeTruthy();
  });

  it("parks L2 tasks as awaiting_approval when not approved", async () => {
    const runtime = new AgentRuntime(new ModelRouter([new FakeProvider()]));
    const result = await runtime.dispatch({ ...baseMsg(), approvalLevel: "L2" });
    expect(result.status).toBe("awaiting_approval");
  });

  it("executes L2 tasks when approved", async () => {
    const runtime = new AgentRuntime(new ModelRouter([new FakeProvider()]));
    const result = await runtime.dispatch({ ...baseMsg(), approvalLevel: "L2" }, { approved: true });
    expect(result.status).toBe("completed");
  });

  it("L4 tasks return awaiting_review (recommend-only)", async () => {
    const runtime = new AgentRuntime(new ModelRouter([new FakeProvider()]));
    const result = await runtime.dispatch(
      { ...baseMsg(), targetAgent: "digital_twin", approvalLevel: "L4" },
      { approved: true },
    );
    expect(result.status).toBe("awaiting_review");
  });

  it("fails cleanly for unknown agents", async () => {
    const runtime = new AgentRuntime(new ModelRouter([new FakeProvider()]));
    const result = await runtime.dispatch({ ...baseMsg(), targetAgent: "nonexistent" });
    expect(result.status).toBe("failed");
    expect(result.error).toContain("unknown or inactive agent");
  });
});
