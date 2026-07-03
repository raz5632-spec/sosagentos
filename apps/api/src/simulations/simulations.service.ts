import { BadRequestException, Injectable } from "@nestjs/common";
import { getDb, writeAudit } from "@salesos/db";
import { AgentsService } from "../agents/agents.service.js";
import { AnalyticsService } from "../analytics/analytics.service.js";

/**
 * Digital Twin (L4 — recommend only, per the agent catalog): scenario memos
 * grounded in live KPIs. Runs are persisted as reports of type "simulation".
 */
@Injectable()
export class SimulationsService {
  constructor(
    private readonly agents: AgentsService,
    private readonly analytics: AnalyticsService,
  ) {}

  async run(
    orgId: string,
    actorUserId: string,
    input: { question: string; assumptions?: string[] },
    traceId?: string,
  ) {
    if (!input.question?.trim()) throw new BadRequestException("question is required");
    const kpis = await this.analytics.computeKpis(orgId);

    const result = await this.agents.invoke(
      orgId,
      actorUserId,
      {
        agentCode: "digital_twin",
        approvalLevel: "L4",
        approved: true, // L4 executes analysis but its status stays awaiting_review (recommend-only)
        objective:
          "Run a what-if scenario analysis for S.O.S. sales coaching. Ground every estimate in the " +
          "provided KPI baseline; state assumptions explicitly; if data is insufficient for a claim, say so. " +
          "Structure the memo as: baseline, scenario, projected impact, risks, recommendation.",
        context:
          `KPI BASELINE (live): ${JSON.stringify(kpis)}\n` +
          `SCENARIO QUESTION: ${input.question}\n` +
          `USER ASSUMPTIONS: ${(input.assumptions ?? []).join("; ") || "(none provided)"}`,
        budgetTokens: 2000,
      },
      traceId,
    );

    const memo = ((result.output as { text?: string })?.text ?? "").trim();
    const now = new Date();
    const report = await getDb().report.create({
      data: {
        orgId,
        type: "simulation",
        periodStart: now,
        periodEnd: now,
        bodyJson: {
          question: input.question,
          assumptions: input.assumptions ?? [],
          kpiBaseline: kpis,
          memo,
          runtimeStatus: result.status,
        } as object,
      },
    });
    await writeAudit({
      orgId,
      actorType: "agent",
      actorId: "digital_twin",
      action: "simulation.completed",
      subjectType: "report",
      subjectId: report.id,
      traceId,
      payload: { question: input.question },
    });
    return { id: report.id, status: "recommend_only", memo, kpiBaseline: kpis };
  }

  async list(orgId: string) {
    const rows = await getDb().report.findMany({
      where: { orgId, type: "simulation" },
      orderBy: { generatedAt: "desc" },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      generatedAt: r.generatedAt,
      question: (r.bodyJson as { question?: string })?.question,
    }));
  }

  async get(orgId: string, id: string) {
    const report = await getDb().report.findFirst({ where: { id, orgId, type: "simulation" } });
    if (!report) throw new BadRequestException("simulation not found");
    return report;
  }
}
