import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { getDb, writeAudit } from "@salesos/db";
import { AcpMessage } from "@salesos/contracts";
import type { TaskClass } from "@salesos/ai";
import { AgentsService } from "../agents/agents.service.js";

@Injectable()
export class ApprovalsService {
  constructor(private readonly agents: AgentsService) {}

  async list(orgId: string, status = "pending") {
    const rows = await getDb().approval.findMany({
      where: { orgId, status },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((a) => {
      const payload = a.payloadJson as { message?: { objective?: string; approvalLevel?: string; targetAgent?: string } } | null;
      return {
        id: a.id,
        subjectType: a.subjectType,
        subjectId: a.subjectId,
        requestedBy: a.requestedBy,
        status: a.status,
        createdAt: a.createdAt,
        decidedAt: a.decidedAt,
        objective: payload?.message?.objective,
        approvalLevel: payload?.message?.approvalLevel,
        targetAgent: payload?.message?.targetAgent,
      };
    });
  }

  private async loadPending(orgId: string, approvalId: string) {
    const approval = await getDb().approval.findFirst({ where: { id: approvalId, orgId } });
    if (!approval) throw new NotFoundException("approval not found");
    if (approval.status !== "pending") {
      throw new ConflictException(`approval already ${approval.status}`);
    }
    return approval;
  }

  async approve(orgId: string, approvalId: string, approverUserId: string, traceId?: string) {
    const approval = await this.loadPending(orgId, approvalId);
    const payload = approval.payloadJson as { message?: unknown; taskClass?: TaskClass } | null;
    if (!payload?.message) {
      throw new BadRequestException("approval has no replayable payload");
    }
    const msg = AcpMessage.parse(payload.message);

    const db = getDb();
    await db.approval.update({
      where: { id: approval.id },
      data: { status: "approved", approverUserId, decidedAt: new Date() },
    });
    await writeAudit({
      orgId,
      actorType: "user",
      actorId: approverUserId,
      action: "approval.approved",
      subjectType: "approval",
      subjectId: approval.id,
      traceId,
      payload: { objective: msg.objective, approvalLevel: msg.approvalLevel },
    });

    // Re-dispatch the parked message with the human approval attached.
    return this.agents.dispatchApproved(msg, payload.taskClass ?? "default", traceId);
  }

  async reject(
    orgId: string,
    approvalId: string,
    approverUserId: string,
    reason?: string,
    traceId?: string,
  ) {
    const approval = await this.loadPending(orgId, approvalId);
    await getDb().approval.update({
      where: { id: approval.id },
      data: {
        status: "rejected",
        approverUserId,
        decidedAt: new Date(),
        decisionNote: reason,
      },
    });
    await writeAudit({
      orgId,
      actorType: "user",
      actorId: approverUserId,
      action: "approval.rejected",
      subjectType: "approval",
      subjectId: approval.id,
      traceId,
      payload: { reason: reason ?? null },
    });
    return { id: approval.id, status: "rejected", reason: reason ?? null };
  }
}
