import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { getDb, writeAudit } from "@salesos/db";
import { AgentsService } from "../agents/agents.service.js";

// Compliance note (constitution): observations are user-supplied public content only.
// No scraping — the pipeline records what a human saw, then analyzes patterns.

@Injectable()
export class CompetitorsService {
  constructor(private readonly agents: AgentsService) {}

  async create(
    orgId: string,
    actorUserId: string,
    input: { name: string; handle?: string; channels?: string[] },
    traceId?: string,
  ) {
    const competitor = await getDb().competitor.create({
      data: {
        orgId,
        name: input.name,
        handle: input.handle,
        channelsJson: input.channels ?? [],
        trackingStatus: "active",
      },
    });
    await writeAudit({
      orgId,
      actorType: "user",
      actorId: actorUserId,
      action: "competitor.created",
      subjectType: "competitor",
      subjectId: competitor.id,
      traceId,
      payload: { name: input.name },
    });
    return competitor;
  }

  list(orgId: string) {
    return getDb().competitor.findMany({
      where: { orgId },
      include: { _count: { select: { observations: true } } },
      orderBy: { name: "asc" },
    });
  }

  private async mustGet(orgId: string, id: string) {
    const competitor = await getDb().competitor.findFirst({ where: { id, orgId } });
    if (!competitor) throw new NotFoundException("competitor not found");
    return competitor;
  }

  async addObservation(
    orgId: string,
    competitorId: string,
    actorUserId: string,
    input: { summary: string; url?: string; contentType?: string; signals?: Record<string, unknown> },
    traceId?: string,
  ) {
    await this.mustGet(orgId, competitorId);
    const observation = await getDb().competitorObservation.create({
      data: {
        competitorId,
        observedAt: new Date(),
        url: input.url,
        contentType: input.contentType,
        summary: input.summary,
        signalsJson: (input.signals ?? {}) as object,
      },
    });
    await writeAudit({
      orgId,
      actorType: "user",
      actorId: actorUserId,
      action: "competitor.observed",
      subjectType: "competitor",
      subjectId: competitorId,
      traceId,
      payload: { observationId: observation.id, contentType: input.contentType ?? null },
    });
    return observation;
  }

  async observations(orgId: string, competitorId: string) {
    await this.mustGet(orgId, competitorId);
    return getDb().competitorObservation.findMany({
      where: { competitorId },
      orderBy: { observedAt: "desc" },
      take: 100,
    });
  }

  /**
   * competitor_intelligence agent (L1) analyzes recent observations.
   * Valid JSON opportunities become a Decision + Recommendations (decisioning BOM);
   * anything else returns needs_review without writing decisions.
   */
  async analyze(orgId: string, competitorId: string, actorUserId: string, traceId?: string) {
    const competitor = await this.mustGet(orgId, competitorId);
    const recent = await getDb().competitorObservation.findMany({
      where: { competitorId },
      orderBy: { observedAt: "desc" },
      take: 20,
    });
    if (recent.length === 0) {
      throw new BadRequestException("no observations to analyze — record observations first");
    }

    const obsText = recent
      .map((o) => `- ${o.observedAt.toISOString().slice(0, 10)} [${o.contentType ?? "unknown"}] ${o.summary}`)
      .join("\n");
    const result = await this.agents.invoke(
      orgId,
      actorUserId,
      {
        agentCode: "competitor_intelligence",
        approvalLevel: "L1",
        objective:
          `Analyze the public-content observations of competitor "${competitor.name}" for S.O.S. sales coaching. ` +
          'Return STRICT JSON only: {"trends":["..."],"opportunities":[{"action":"...","rationale":"...","confidence":0-1}]}.',
        context: `OBSERVATIONS (newest first):\n${obsText}`,
        budgetTokens: 1200,
      },
      traceId,
    );

    const raw = ((result.output as { text?: string })?.text ?? "").trim();
    try {
      const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as {
        trends?: string[];
        opportunities?: Array<{ action?: string; rationale?: string; confidence?: number }>;
      };
      if (Array.isArray(parsed.opportunities) && parsed.opportunities.length > 0) {
        const db = getDb();
        const decision = await db.decision.create({
          data: {
            orgId,
            type: "competitor_opportunity",
            objective: `Opportunities derived from ${competitor.name} observations`,
            status: "open",
            createdBy: "competitor_intelligence",
            approvalLevel: "L2",
          },
        });
        for (const opp of parsed.opportunities) {
          if (!opp.action) continue;
          await db.recommendation.create({
            data: {
              orgId,
              decisionId: decision.id,
              actionType: "opportunity",
              confidence: Math.min(Math.max(opp.confidence ?? 0.5, 0), 1),
              rationale: `${opp.action} — ${opp.rationale ?? ""}`.trim(),
            },
          });
        }
        for (const trend of parsed.trends ?? []) {
          await db.insight.create({
            data: { orgId, decisionId: decision.id, type: "trend", confidence: 0.7, summary: trend },
          });
        }
        await writeAudit({
          orgId,
          actorType: "agent",
          actorId: "competitor_intelligence",
          action: "competitor.analyzed",
          subjectType: "decision",
          subjectId: decision.id,
          traceId,
          payload: { competitorId, opportunities: parsed.opportunities.length },
        });
        return { verdict: "decision_created", decisionId: decision.id, ...parsed };
      }
    } catch {
      // fall through
    }
    return { verdict: "needs_review", raw };
  }
}
