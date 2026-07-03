import { Injectable } from "@nestjs/common";
import { getDb, writeAudit } from "@salesos/db";

const AT_RISK_THRESHOLD = 0.6;

@Injectable()
export class AnalyticsService {
  /** Compute the current KPI set from live tables. */
  async computeKpis(orgId: string) {
    const db = getDb();
    const [
      studentsTotal,
      studentsAtRisk,
      approvalsPending,
      knowledgeProduction,
      contentApproved,
      contentInPipeline,
      invocationAgg,
    ] = await Promise.all([
      db.student.count({ where: { orgId } }),
      db.student.count({ where: { orgId, dropoutRisk: { gte: AT_RISK_THRESHOLD } } }),
      db.approval.count({ where: { orgId, status: "pending" } }),
      db.knowledgeItem.count({ where: { orgId, status: "production" } }),
      db.contentAsset.count({ where: { orgId, status: "approved" } }),
      db.contentAsset.count({ where: { orgId, status: { in: ["brief", "drafted", "in_review"] } } }),
      db.modelInvocation.aggregate({ _count: true, _sum: { costUsd: true } }),
    ]);

    return {
      students_total: studentsTotal,
      students_at_risk: studentsAtRisk,
      approvals_pending: approvalsPending,
      knowledge_production_items: knowledgeProduction,
      content_approved: contentApproved,
      content_in_pipeline: contentInPipeline,
      ai_invocations_total: invocationAgg._count,
      ai_cost_usd_total: Number(invocationAgg._sum.costUsd ?? 0),
    };
  }

  /** Persist the current KPI set as kpi_snapshots rows (one per metric). */
  async snapshot(orgId: string, actorUserId: string, traceId?: string) {
    const kpis = await this.computeKpis(orgId);
    const ts = new Date();
    await getDb().kpiSnapshot.createMany({
      data: Object.entries(kpis).map(([metricCode, value]) => ({
        orgId,
        metricCode,
        ts,
        value: Number(value),
      })),
    });
    await writeAudit({
      orgId,
      actorType: "user",
      actorId: actorUserId,
      action: "kpi.snapshot",
      subjectType: "kpi_snapshot",
      subjectId: ts.toISOString(),
      traceId,
      payload: kpis,
    });
    return { ts: ts.toISOString(), metrics: kpis };
  }

  /** CEO dashboard: live KPIs + pending approvals + recent AI spend + snapshot trend. */
  async dashboard(orgId: string) {
    const db = getDb();
    const [kpis, pendingApprovals, recentInvocations, trendRows] = await Promise.all([
      this.computeKpis(orgId),
      db.approval.findMany({
        where: { orgId, status: "pending" },
        orderBy: { createdAt: "asc" },
        take: 10,
        select: { id: true, subjectType: true, requestedBy: true, createdAt: true, payloadJson: true },
      }),
      db.modelInvocation.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { agent: { select: { code: true } } },
      }),
      db.kpiSnapshot.findMany({
        where: { orgId, metricCode: "ai_cost_usd_total" },
        orderBy: { ts: "desc" },
        take: 30,
        select: { ts: true, value: true },
      }),
    ]);

    return {
      kpis,
      pendingApprovals: pendingApprovals.map((a) => ({
        id: a.id,
        subjectType: a.subjectType,
        requestedBy: a.requestedBy,
        createdAt: a.createdAt,
        title:
          (a.payloadJson as { title?: string; message?: { objective?: string } } | null)?.title ??
          (a.payloadJson as { message?: { objective?: string } } | null)?.message?.objective ??
          null,
      })),
      recentAiActivity: recentInvocations.map((r) => ({
        agent: r.agent.code,
        model: r.model,
        costUsd: Number(r.costUsd),
        createdAt: r.createdAt,
      })),
      aiCostTrend: trendRows.reverse(),
    };
  }
}
