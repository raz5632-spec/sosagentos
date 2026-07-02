// Live smoke test: one real L1 agent invocation through the router + runtime.
// Usage: DATABASE_URL=... ANTHROPIC_API_KEY=... pnpm exec tsx scripts/smoke.mts
import { randomUUID } from "node:crypto";

const { getDb } = await import("@salesos/db");
const { AnthropicProvider } = await import("../src/anthropic.ts");
const { ModelRouter } = await import("../src/router.ts");
const { AgentRuntime } = await import("../src/runtime.ts");

const org = await getDb().organization.findUniqueOrThrow({ where: { slug: "sos" } });
const runtime = new AgentRuntime(new ModelRouter([new AnthropicProvider()]));
const result = await runtime.dispatch({
  messageId: randomUUID(),
  taskId: "TASK-SMOKE-001",
  tenantId: org.id,
  sourceAgent: "ceo_interface",
  targetAgent: "ceo_interface",
  requestedBy: "smoke-test",
  approvalLevel: "L1",
  objective: "Reply with exactly one short sentence in Hebrew confirming SalesOS agent runtime is live.",
  constraints: { budgetTokens: 200 },
}, { taskClass: "lightweight" });
console.log("STATUS:", result.status);
console.log("MODEL:", result.audit.model, "| COST USD:", result.audit.costEstimateUsd?.toFixed(6));
console.log("OUTPUT:", (result.output as { text?: string })?.text ?? result.error);
await getDb().$disconnect();
