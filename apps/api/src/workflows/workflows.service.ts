import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { getDb, writeAudit } from "@salesos/db";
import type { ApprovalLevel } from "@salesos/contracts";
import type { TaskClass } from "@salesos/ai";
import { AgentsService } from "../agents/agents.service.js";

export interface WorkflowStep {
  agentCode: string;
  objective: string;
  approvalLevel?: ApprovalLevel;
  taskClass?: TaskClass;
}

// v1 in-process runner — see docs/adr/ADR-2026-07-03-db-workflow-runner-v1.md

@Injectable()
export class WorkflowsService {
  constructor(private readonly agents: AgentsService) {}

  async create(
    orgId: string,
    actorUserId: string,
    input: { code: string; name: string; triggerType?: string; approvalPolicy?: string; steps: WorkflowStep[] },
    traceId?: string,
  ) {
    if (!input.steps?.length) throw new BadRequestException("at least one step is required");
    for (const s of input.steps) {
      if (!s.agentCode || !s.objective) {
        throw new BadRequestException("each step needs agentCode and objective");
      }
    }
    const db = getDb();
    const existing = await db.workflow.findUnique({
      where: { orgId_code: { orgId, code: input.code } },
    });
    if (existing) throw new ConflictException(`workflow code ${input.code} already exists`);

    const workflow = await db.workflow.create({
      data: {
        orgId,
        code: input.code,
        name: input.name,
        triggerType: input.triggerType ?? "manual",
        approvalPolicy: input.approvalPolicy ?? "per_step",
      },
    });
    const version = await db.workflowVersion.create({
      data: {
        workflowId: workflow.id,
        semver: "1.0.0",
        definitionJson: { steps: input.steps } as object,
        status: "active",
      },
    });
    await writeAudit({
      orgId,
      actorType: "user",
      actorId: actorUserId,
      action: "workflow.created",
      subjectType: "workflow",
      subjectId: workflow.id,
      traceId,
      payload: { code: input.code, steps: input.steps.length },
    });
    return { id: workflow.id, versionId: version.id, semver: version.semver };
  }

  list(orgId: string) {
    return getDb().workflow.findMany({
      where: { orgId },
      include: {
        versions: { where: { status: "active" }, select: { id: true, semver: true } },
        _count: { select: { runs: true } },
      },
      orderBy: { code: "asc" },
    });
  }

  /** Execute the active version step-by-step. L2+ steps park and block the run. */
  async run(orgId: string, workflowId: string, actorUserId: string, traceId?: string) {
    const db = getDb();
    const workflow = await db.workflow.findFirst({
      where: { id: workflowId, orgId },
      include: { versions: { where: { status: "active" }, take: 1 } },
    });
    if (!workflow) throw new NotFoundException("workflow not found");
    const version = workflow.versions[0];
    if (!version) throw new ConflictException("workflow has no active version");
    const steps = (version.definitionJson as unknown as { steps: WorkflowStep[] }).steps;

    const run = await db.workflowRun.create({
      data: { workflowId, versionId: version.id, status: "in_progress", startedAt: new Date() },
    });

    let runStatus = "completed";
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const taskRun = await db.taskRun.create({
        data: {
          workflowRunId: run.id,
          taskId: `STEP-${i + 1}`,
          agentCode: step.agentCode,
          priority: "medium",
          status: "in_progress",
          attemptNo: 1,
        },
      });

      let outcome = "failed";
      for (let attempt = 1; attempt <= 2; attempt++) {
        const result = await this.agents.invoke(
          orgId,
          actorUserId,
          {
            agentCode: step.agentCode,
            objective: step.objective,
            approvalLevel: step.approvalLevel ?? "L1",
            taskClass: step.taskClass,
          },
          traceId,
        );
        if (result.status === "completed" || result.status === "awaiting_review") {
          outcome = "completed";
          break;
        }
        if (result.status === "awaiting_approval") {
          outcome = "awaiting_approval";
          break;
        }
        // failed → one retry (deterministic failures shouldn't loop; ACP policy)
        await db.taskRun.update({ where: { id: taskRun.id }, data: { attemptNo: attempt + 1 } });
      }

      await db.taskRun.update({ where: { id: taskRun.id }, data: { status: outcome } });
      if (outcome === "awaiting_approval") {
        runStatus = "blocked";
        break;
      }
      if (outcome === "failed") {
        runStatus = "failed";
        break;
      }
    }

    const finished = await db.workflowRun.update({
      where: { id: run.id },
      data: { status: runStatus, endedAt: new Date() },
      include: { taskRuns: { orderBy: { taskId: "asc" } } },
    });
    await writeAudit({
      orgId,
      actorType: "system",
      actorId: "workflow_runner",
      action: `workflow.run_${runStatus}`,
      subjectType: "workflow_run",
      subjectId: run.id,
      traceId,
      payload: { workflowCode: workflow.code, steps: steps.length },
    });
    return finished;
  }

  async runs(orgId: string, workflowId: string) {
    const workflow = await getDb().workflow.findFirst({ where: { id: workflowId, orgId } });
    if (!workflow) throw new NotFoundException("workflow not found");
    return getDb().workflowRun.findMany({
      where: { workflowId },
      include: { taskRuns: true },
      orderBy: { startedAt: "desc" },
      take: 50,
    });
  }
}
