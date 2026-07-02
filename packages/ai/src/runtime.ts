import { AcpMessage, confidencePolicy } from "@salesos/contracts";
import { getDb, writeAudit } from "@salesos/db";
import { createHash } from "node:crypto";
import type { ModelRouter, TaskClass } from "./router.js";
import { estimateCostUsd } from "./pricing.js";

export interface DispatchOptions {
  /** Set when a human already approved this task (L2+). */
  approved?: boolean;
  taskClass?: TaskClass;
  traceId?: string;
}

/**
 * Agent Runtime: executes one ACP message against the model router,
 * enforcing approval gates and recording invocation + audit trails.
 */
export class AgentRuntime {
  constructor(private readonly router: ModelRouter) {}

  async dispatch(raw: unknown, opts: DispatchOptions = {}): Promise<AcpMessage> {
    const msg = AcpMessage.parse(raw);
    const db = getDb();

    const agent = await db.agent.findUnique({ where: { code: msg.targetAgent } });
    if (!agent || !agent.active) {
      return { ...msg, status: "failed", error: `unknown or inactive agent: ${msg.targetAgent}` };
    }

    // Approval gate: L2+ requires an explicit human approval before execution.
    const needsApproval = ["L2", "L3", "L4"].includes(msg.approvalLevel);
    if (msg.approvalLevel === "L4") {
      // Recommend-only agents never execute externally; they still may produce a memo.
    } else if (needsApproval && !opts.approved) {
      await writeAudit({
        orgId: msg.tenantId,
        actorType: "agent",
        actorId: agent.code,
        action: "acp.awaiting_approval",
        subjectType: "acp_message",
        subjectId: msg.messageId,
        traceId: opts.traceId,
        payload: { objective: msg.objective, approvalLevel: msg.approvalLevel },
      });
      return { ...msg, status: "awaiting_approval" };
    }

    const startedAt = new Date().toISOString();
    const system = `You are the "${agent.code}" agent of SalesOS (department: ${agent.department}). Follow S.O.S. constitution rules: never guess at low confidence — say what is missing instead. Answer the objective directly.`;
    const prompt = [
      `Objective: ${msg.objective}`,
      msg.inputs.inlineSummary ? `Context: ${msg.inputs.inlineSummary}` : "",
      msg.contextRefs.length ? `Context refs: ${msg.contextRefs.join(", ")}` : "",
      msg.constraints.mustCiteSources ? "You must cite sources for every claim." : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const result = await this.router.complete(opts.taskClass ?? "default", {
        system,
        prompt,
        maxTokens: msg.constraints.budgetTokens,
      });

      const costUsd = estimateCostUsd(result.model, result.usage);
      await db.modelInvocation.create({
        data: {
          agentId: agent.id,
          provider: result.provider,
          model: result.model,
          promptHash: createHash("sha256").update(system + "\n" + prompt).digest("hex"),
          tokensIn: result.usage.inputTokens,
          tokensOut: result.usage.outputTokens,
          costUsd,
        },
      });
      await writeAudit({
        orgId: msg.tenantId,
        actorType: "agent",
        actorId: agent.code,
        action: "acp.completed",
        subjectType: "acp_message",
        subjectId: msg.messageId,
        traceId: opts.traceId,
        payload: { model: result.model, costUsd, failedOver: result.failedOver },
      });

      const confidenceDecision = confidencePolicy(msg.requiredConfidence);
      return {
        ...msg,
        status: msg.approvalLevel === "L4" ? "awaiting_review" : "completed",
        output: { text: result.text, stopReason: result.stopReason, confidenceDecision },
        explainability: {
          whyThisAgent: `registry match for target_agent=${msg.targetAgent}`,
          whyThisModel: result.whyThisModel,
          importantAssumptions: [],
        },
        audit: {
          ...msg.audit,
          startedAt,
          completedAt: new Date().toISOString(),
          costEstimateUsd: costUsd,
          provider: result.provider,
          model: result.model,
          tokenUsage: {
            input: result.usage.inputTokens,
            output: result.usage.outputTokens,
            cachedInput: result.usage.cachedInputTokens,
          },
        },
      };
    } catch (err) {
      await writeAudit({
        orgId: msg.tenantId,
        actorType: "agent",
        actorId: agent.code,
        action: "acp.failed",
        subjectType: "acp_message",
        subjectId: msg.messageId,
        traceId: opts.traceId,
        payload: { error: String(err) },
      });
      return { ...msg, status: "failed", error: String(err) };
    }
  }
}
