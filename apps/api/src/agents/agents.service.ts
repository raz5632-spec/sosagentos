import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { getDb } from "@salesos/db";
import {
  AgentRuntime,
  AnthropicProvider,
  FakeProvider,
  ModelRouter,
  type ModelProvider,
  type TaskClass,
} from "@salesos/ai";
import type { ApprovalLevel } from "@salesos/contracts";

@Injectable()
export class AgentsService {
  private runtime: AgentRuntime;

  constructor() {
    // Real provider when a key is configured; deterministic fake otherwise (CI, keyless dev).
    const providers: ModelProvider[] = process.env.ANTHROPIC_API_KEY
      ? [new AnthropicProvider()]
      : [new FakeProvider()];
    this.runtime = new AgentRuntime(new ModelRouter(providers));
  }

  listAgents() {
    return getDb().agent.findMany({
      where: { active: true },
      select: { code: true, department: true },
      orderBy: [{ department: "asc" }, { code: "asc" }],
    });
  }

  async invoke(
    orgId: string,
    requestedByUserId: string,
    input: {
      agentCode: string;
      objective: string;
      approvalLevel?: ApprovalLevel;
      taskClass?: TaskClass;
      context?: string;
      approved?: boolean;
      budgetTokens?: number;
    },
    traceId?: string,
  ) {
    return this.runtime.dispatch(
      {
        messageId: randomUUID(),
        taskId: `TASK-API-${Date.now()}`,
        tenantId: orgId,
        sourceAgent: "ceo_interface",
        targetAgent: input.agentCode,
        requestedBy: requestedByUserId,
        approvalLevel: input.approvalLevel ?? "L2",
        objective: input.objective,
        constraints: input.budgetTokens ? { budgetTokens: input.budgetTokens } : {},
        inputs: input.context ? { inlineSummary: input.context } : {},
      },
      { approved: input.approved, taskClass: input.taskClass, traceId },
    );
  }

  async listInvocations(limit = 50) {
    const rows = await getDb().modelInvocation.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 200),
      include: { agent: { select: { code: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      agent: r.agent.code,
      provider: r.provider,
      model: r.model,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      costUsd: Number(r.costUsd),
      createdAt: r.createdAt,
    }));
  }
}
