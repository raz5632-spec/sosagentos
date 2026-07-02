import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { getDb, writeAudit } from "@salesos/db";
import { AgentsService } from "../agents/agents.service.js";

const STUDENT_SELECT = {
  id: true,
  stage: true,
  motivationScore: true,
  dropoutRisk: true,
  retentionScore: true,
  learningStyle: true,
  createdAt: true,
  user: { select: { id: true, email: true, displayName: true } },
  primaryCoach: { select: { id: true, displayName: true } },
} as const;

@Injectable()
export class StudentsService {
  constructor(private readonly agents: AgentsService) {}

  /** Enroll: upsert the identity user, grant student membership, create the profile. */
  async enroll(
    orgId: string,
    actorUserId: string,
    input: { email: string; displayName: string; primaryCoachUserId?: string },
    traceId?: string,
  ) {
    const db = getDb();
    const role = await db.role.findUniqueOrThrow({ where: { code: "student" } });
    const user = await db.user.upsert({
      where: { email: input.email },
      update: {},
      create: { email: input.email, displayName: input.displayName },
    });
    const existing = await db.student.findUnique({ where: { userId: user.id } });
    if (existing) throw new BadRequestException("student profile already exists for this user");

    await db.membership.upsert({
      where: { orgId_userId_roleId: { orgId, userId: user.id, roleId: role.id } },
      update: {},
      create: { orgId, userId: user.id, roleId: role.id },
    });
    const student = await db.student.create({
      data: {
        orgId,
        userId: user.id,
        primaryCoachUserId: input.primaryCoachUserId,
        stage: "onboarding",
      },
      select: STUDENT_SELECT,
    });
    await writeAudit({
      orgId,
      actorType: "user",
      actorId: actorUserId,
      action: "student.enrolled",
      subjectType: "student",
      subjectId: student.id,
      traceId,
      payload: { email: input.email },
    });
    return student;
  }

  list(orgId: string) {
    return getDb().student.findMany({
      where: { orgId },
      select: STUDENT_SELECT,
      orderBy: { createdAt: "desc" },
    });
  }

  async get(orgId: string, id: string) {
    const student = await getDb().student.findFirst({
      where: { id, orgId },
      select: STUDENT_SELECT,
    });
    if (!student) throw new NotFoundException("student not found");
    return student;
  }

  /** Coach note → audit ledger; the timeline is read from the same ledger. */
  async addNote(orgId: string, id: string, actorUserId: string, content: string, traceId?: string) {
    await this.get(orgId, id);
    const event = await writeAudit({
      orgId,
      actorType: "user",
      actorId: actorUserId,
      action: "student.note",
      subjectType: "student",
      subjectId: id,
      traceId,
      payload: { content },
    });
    return { id: event.id, action: event.action, createdAt: event.createdAt };
  }

  async timeline(orgId: string, id: string) {
    await this.get(orgId, id);
    const events = await getDb().auditEvent.findMany({
      where: { orgId, subjectType: "student", subjectId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, action: true, actorType: true, actorId: true, payloadJson: true, createdAt: true },
    });
    return events;
  }

  /**
   * Risk assessment via the student_intelligence agent (L1).
   * Scores update only when the agent returns valid JSON; otherwise needs_review.
   */
  async assess(orgId: string, id: string, actorUserId: string, traceId?: string) {
    const student = await this.get(orgId, id);
    const timeline = await this.timeline(orgId, id);
    const timelineText = timeline
      .slice(0, 20)
      .map((e) => `${e.createdAt.toISOString()} ${e.action}: ${JSON.stringify(e.payloadJson ?? {})}`)
      .join("\n");

    const result = await this.agents.invoke(
      orgId,
      actorUserId,
      {
        agentCode: "student_intelligence",
        approvalLevel: "L1",
        taskClass: "lightweight",
        objective:
          "Assess this S.O.S. student profile and recent activity. " +
          'Return STRICT JSON only: {"motivation_score":0-1,"dropout_risk":0-1,"retention_score":0-1,"stage":"onboarding|active|at_risk|graduating","rationale":"..."}.',
        context: `PROFILE: stage=${student.stage}, scores(m/d/r)=${student.motivationScore}/${student.dropoutRisk}/${student.retentionScore}\nRECENT TIMELINE:\n${timelineText || "(no events)"}`,
        budgetTokens: 800,
      },
      traceId,
    );

    const raw = ((result.output as { text?: string })?.text ?? "").trim();
    try {
      const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as {
        motivation_score?: number;
        dropout_risk?: number;
        retention_score?: number;
        stage?: string;
        rationale?: string;
      };
      const valid = [parsed.motivation_score, parsed.dropout_risk, parsed.retention_score].every(
        (v) => typeof v === "number" && v >= 0 && v <= 1,
      );
      if (valid) {
        const updated = await getDb().student.update({
          where: { id },
          data: {
            motivationScore: parsed.motivation_score,
            dropoutRisk: parsed.dropout_risk,
            retentionScore: parsed.retention_score,
            ...(parsed.stage ? { stage: parsed.stage } : {}),
          },
          select: STUDENT_SELECT,
        });
        await writeAudit({
          orgId,
          actorType: "agent",
          actorId: "student_intelligence",
          action: "student.assessed",
          subjectType: "student",
          subjectId: id,
          traceId,
          payload: {
            dropoutRisk: parsed.dropout_risk,
            motivationScore: parsed.motivation_score,
            rationale: parsed.rationale ?? null,
          },
        });
        return { verdict: "updated", student: updated, rationale: parsed.rationale ?? null };
      }
    } catch {
      // fall through
    }
    return { verdict: "needs_review", raw };
  }

  /** Coach intervention suggestions — L2 by catalog, so this parks an approval. */
  async suggestInterventions(orgId: string, id: string, actorUserId: string, traceId?: string) {
    const student = await this.get(orgId, id);
    return this.agents.invoke(
      orgId,
      actorUserId,
      {
        agentCode: "coach_support",
        approvalLevel: "L2",
        objective: `Recommend up to 3 concrete coach interventions for student ${student.user?.displayName ?? id} (stage=${student.stage}, dropout_risk=${student.dropoutRisk ?? "unknown"}).`,
        context: "Base recommendations only on the provided profile; if data is insufficient, say what is missing.",
      },
      traceId,
    );
  }
}
