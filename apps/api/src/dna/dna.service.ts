import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { getDb, writeAudit } from "@salesos/db";
import { AgentsService } from "../agents/agents.service.js";

export interface DnaEvaluation {
  verdict: "pass" | "fail" | "needs_review";
  violations: Array<{ ruleId?: string; rule?: string; severity?: string; detail?: string }>;
  raw: string;
}

@Injectable()
export class DnaService {
  constructor(private readonly agents: AgentsService) {}

  listRules(orgId: string, includeInactive = false) {
    return getDb().brandRule.findMany({
      where: { orgId, ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ severity: "asc" }, { ruleType: "asc" }],
    });
  }

  async createRule(
    orgId: string,
    actorUserId: string,
    input: { ruleType: string; ruleText: string; severity?: string },
    traceId?: string,
  ) {
    const rule = await getDb().brandRule.create({
      data: {
        orgId,
        ruleType: input.ruleType,
        ruleText: input.ruleText,
        severity: input.severity ?? "major",
      },
    });
    await writeAudit({
      orgId,
      actorType: "user",
      actorId: actorUserId,
      action: "brand_rule.created",
      subjectType: "brand_rule",
      subjectId: rule.id,
      traceId,
      payload: { ruleType: rule.ruleType, severity: rule.severity },
    });
    return rule;
  }

  async deactivateRule(orgId: string, ruleId: string, actorUserId: string, traceId?: string) {
    const res = await getDb().brandRule.updateMany({
      where: { id: ruleId, orgId },
      data: { active: false },
    });
    if (res.count === 0) throw new NotFoundException("rule not found");
    await writeAudit({
      orgId,
      actorType: "user",
      actorId: actorUserId,
      action: "brand_rule.deactivated",
      subjectType: "brand_rule",
      subjectId: ruleId,
      traceId,
    });
    return { id: ruleId, active: false };
  }

  /**
   * Run draft content against active brand rules via the Brand DNA agent (L1).
   * The agent is asked for strict JSON; anything unparseable degrades to needs_review.
   */
  async evaluate(orgId: string, requestedByUserId: string, content: string, traceId?: string): Promise<DnaEvaluation> {
    const rules = await this.listRules(orgId);
    if (rules.length === 0) {
      throw new BadRequestException("no active brand rules — create rules before evaluating");
    }

    const rulesBlock = rules
      .map((r) => `- [${r.id}] (${r.ruleType}, severity=${r.severity}) ${r.ruleText}`)
      .join("\n");
    const result = await this.agents.invoke(
      orgId,
      requestedByUserId,
      {
        agentCode: "brand_dna",
        approvalLevel: "L1",
        taskClass: "lightweight",
        objective:
          "Evaluate the draft content against the S.O.S. brand rules. " +
          'Return STRICT JSON only: {"verdict":"pass|fail","violations":[{"ruleId":"...","severity":"...","detail":"..."}]}. ' +
          "A single critical/major violation means verdict fail.",
        context: `BRAND RULES:\n${rulesBlock}\n\nDRAFT CONTENT:\n${content}`,
      },
      traceId,
    );

    const text = ((result.output as { text?: string })?.text ?? "").trim();
    try {
      const jsonText = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
      const parsed = JSON.parse(jsonText) as { verdict?: string; violations?: DnaEvaluation["violations"] };
      if (parsed.verdict === "pass" || parsed.verdict === "fail") {
        return { verdict: parsed.verdict, violations: parsed.violations ?? [], raw: text };
      }
    } catch {
      // fall through to needs_review
    }
    return { verdict: "needs_review", violations: [], raw: text };
  }
}
