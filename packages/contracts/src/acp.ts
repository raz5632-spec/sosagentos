import { z } from "zod";

// Agent Communication Protocol — canonical message schema.
// Spec: docs/02-architecture/acp-spec.md

export const Priority = z.enum(["critical", "high", "medium", "low", "background"]);
export type Priority = z.infer<typeof Priority>;

export const ApprovalLevel = z.enum(["L0", "L1", "L2", "L3", "L4"]);
export type ApprovalLevel = z.infer<typeof ApprovalLevel>;

export const TaskStatus = z.enum([
  "created",
  "triaged",
  "planned",
  "queued",
  "in_progress",
  "blocked",
  "self_validated",
  "qa_review",
  "awaiting_review",
  "awaiting_approval",
  "completed",
  "failed",
  "rolled_back",
]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const AcpConstraints = z.object({
  deadline: z.string().datetime().optional(),
  budgetTokens: z.number().int().positive().optional(),
  maxRetries: z.number().int().min(0).default(2),
  mustCiteSources: z.boolean().default(false),
  providerRestrictions: z.array(z.string()).default([]),
});

export const AcpExplainability = z.object({
  whyThisAgent: z.string().default(""),
  whyThisModel: z.string().default(""),
  importantAssumptions: z.array(z.string()).default([]),
});

export const AcpAudit = z.object({
  createdAt: z.string().datetime().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  costEstimateUsd: z.number().min(0).default(0),
  provider: z.string().optional(),
  model: z.string().optional(),
  tokenUsage: z
    .object({
      input: z.number().int().min(0).default(0),
      output: z.number().int().min(0).default(0),
      cachedInput: z.number().int().min(0).default(0),
    })
    .default({}),
});

export const AcpMessage = z.object({
  messageId: z.string().uuid(),
  workflowId: z.string().uuid().optional(),
  taskId: z.string(),
  parentTaskId: z.string().optional(),
  correlationId: z.string().optional(),
  causationId: z.string().optional(),
  tenantId: z.string(),
  sourceAgent: z.string(),
  targetAgent: z.string(),
  requestedBy: z.string(),
  priority: Priority.default("medium"),
  approvalLevel: ApprovalLevel,
  requiredConfidence: z.number().min(0).max(1).default(0.9),
  objective: z.string().min(1),
  constraints: AcpConstraints.default({}),
  contextRefs: z.array(z.string()).default([]),
  inputs: z
    .object({
      payloadRef: z.string().optional(),
      inlineSummary: z.string().optional(),
    })
    .default({}),
  status: TaskStatus.default("created"),
  output: z.unknown().nullable().default(null),
  evidence: z.array(z.string()).default([]),
  explainability: AcpExplainability.default({}),
  audit: AcpAudit.default({}),
  error: z.string().nullable().default(null),
  nextAction: z.string().nullable().default(null),
});
export type AcpMessage = z.infer<typeof AcpMessage>;

/** Confidence bands per docs/02-architecture/acp-spec.md */
export type ConfidenceDecision = "execute" | "qa_review" | "gather_more" | "escalate";

export function confidencePolicy(confidence: number): ConfidenceDecision {
  if (confidence >= 0.9) return "execute";
  if (confidence >= 0.75) return "qa_review";
  if (confidence >= 0.6) return "gather_more";
  return "escalate";
}
