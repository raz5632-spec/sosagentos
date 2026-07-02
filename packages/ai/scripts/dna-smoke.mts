// Live DNA evaluation smoke: brand_dna agent judges violating content.
// Usage: DATABASE_URL=... ANTHROPIC_API_KEY=... pnpm exec tsx scripts/dna-smoke.mts
import { randomUUID } from "node:crypto";

const { getDb } = await import("@salesos/db");
const { AnthropicProvider } = await import("../src/anthropic.ts");
const { ModelRouter } = await import("../src/router.ts");
const { AgentRuntime } = await import("../src/runtime.ts");

const org = await getDb().organization.findUniqueOrThrow({ where: { slug: "sos" } });
const runtime = new AgentRuntime(new ModelRouter([new AnthropicProvider()]));
const result = await runtime.dispatch({
  messageId: randomUUID(),
  taskId: "TASK-DNA-SMOKE",
  tenantId: org.id,
  sourceAgent: "ceo_interface",
  targetAgent: "brand_dna",
  requestedBy: "smoke",
  approvalLevel: "L1",
  objective: 'Evaluate the draft content against the S.O.S. brand rules. Return STRICT JSON only: {"verdict":"pass|fail","violations":[{"ruleId":"...","severity":"...","detail":"..."}]}. A single critical/major violation means verdict fail.',
  constraints: { budgetTokens: 400 },
  inputs: { inlineSummary: "BRAND RULES:\n- [rule-1] (prohibited_claim, severity=critical) Never promise guaranteed income or specific earnings.\n\nDRAFT CONTENT:\n\u05d4\u05e6\u05d8\u05e8\u05e4\u05d5 \u05dc\u05ea\u05d5\u05db\u05e0\u05d9\u05ea \u05e9\u05dc\u05e0\u05d5 \u05d5\u05d0\u05ea\u05dd \u05de\u05d5\u05d1\u05d8\u05d7\u05d9\u05dd \u05dc\u05d4\u05db\u05e4\u05d9\u05dc \u05d0\u05ea \u05d4\u05d4\u05db\u05e0\u05e1\u05d4 \u05ea\u05d5\u05da \u05d7\u05d5\u05d3\u05e9!" },
}, { taskClass: "lightweight" });
console.log("VERDICT RAW:", (result.output as { text?: string })?.text ?? result.error);
await getDb().$disconnect();
