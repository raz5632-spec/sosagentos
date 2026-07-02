import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { getDb, writeAudit } from "@salesos/db";
import { AgentsService } from "../agents/agents.service.js";
import { KnowledgeService } from "../knowledge/knowledge.service.js";

export interface LessonDigest {
  summary: string;
  actionItems: string[];
  knowledgeItemId: string;
}

@Injectable()
export class EducationService {
  constructor(
    private readonly agents: AgentsService,
    private readonly knowledge: KnowledgeService,
  ) {}

  // ── Courses ────────────────────────────────────────────────

  async createCourse(orgId: string, actorUserId: string, title: string, traceId?: string) {
    const course = await getDb().course.create({ data: { orgId, title, status: "active" } });
    await writeAudit({
      orgId,
      actorType: "user",
      actorId: actorUserId,
      action: "course.created",
      subjectType: "course",
      subjectId: course.id,
      traceId,
      payload: { title },
    });
    return course;
  }

  listCourses(orgId: string) {
    return getDb().course.findMany({
      where: { orgId },
      include: { _count: { select: { lessons: true } } },
      orderBy: { title: "asc" },
    });
  }

  // ── Lessons ────────────────────────────────────────────────

  async createLesson(
    orgId: string,
    courseId: string,
    actorUserId: string,
    input: { scheduledAt?: string; teacherUserId?: string },
    traceId?: string,
  ) {
    const course = await getDb().course.findFirst({ where: { id: courseId, orgId } });
    if (!course) throw new NotFoundException("course not found");

    const lesson = await getDb().lesson.create({
      data: {
        orgId,
        courseId,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
        teacherUserId: input.teacherUserId,
      },
    });
    await writeAudit({
      orgId,
      actorType: "user",
      actorId: actorUserId,
      action: "lesson.created",
      subjectType: "lesson",
      subjectId: lesson.id,
      traceId,
    });
    return lesson;
  }

  async getLesson(orgId: string, lessonId: string) {
    const lesson = await getDb().lesson.findFirst({
      where: { id: lessonId, orgId },
      include: { transcript: true, course: { select: { id: true, title: true } } },
    });
    if (!lesson) throw new NotFoundException("lesson not found");
    return lesson;
  }

  // ── Transcript ingestion → summary → knowledge proposal ───

  async ingestTranscript(
    orgId: string,
    lessonId: string,
    actorUserId: string,
    input: { text: string; sttProvider?: string },
    traceId?: string,
  ): Promise<LessonDigest> {
    if (!input.text?.trim()) throw new BadRequestException("transcript text is required");
    const db = getDb();
    const lesson = await db.lesson.findFirst({
      where: { id: lessonId, orgId },
      include: { transcript: true, course: { select: { title: true } } },
    });
    if (!lesson) throw new NotFoundException("lesson not found");
    if (lesson.transcript) throw new ConflictException("lesson already has a transcript");

    await db.transcript.create({
      data: {
        orgId,
        lessonId,
        text: input.text,
        sttProvider: input.sttProvider ?? "manual",
      },
    });
    await writeAudit({
      orgId,
      actorType: "user",
      actorId: actorUserId,
      action: "transcript.ingested",
      subjectType: "lesson",
      subjectId: lessonId,
      traceId,
      payload: { chars: input.text.length, sttProvider: input.sttProvider ?? "manual" },
    });

    // Lesson agent (L1): summary + action items. Unparseable output degrades gracefully.
    const result = await this.agents.invoke(
      orgId,
      actorUserId,
      {
        agentCode: "lesson",
        approvalLevel: "L1",
        objective:
          "Summarize this sales-coaching lesson transcript for the S.O.S. knowledge base. " +
          'Return STRICT JSON only: {"summary":"<10-20 sentence summary in the transcript language>","action_items":["..."]}.',
        context: `COURSE: ${lesson.course.title}\n\nTRANSCRIPT:\n${input.text.slice(0, 30000)}`,
        budgetTokens: 2000,
      },
      traceId,
    );

    const raw = ((result.output as { text?: string })?.text ?? "").trim();
    let summary = raw;
    let actionItems: string[] = [];
    try {
      const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as {
        summary?: string;
        action_items?: string[];
      };
      if (parsed.summary) {
        summary = parsed.summary;
        actionItems = parsed.action_items ?? [];
      }
    } catch {
      // keep raw text as summary
    }

    // Knowledge proposal: candidate item awaiting the GOV-001 approval pipeline.
    const proposal = await this.knowledge.capture(
      orgId,
      actorUserId,
      {
        title: `Lesson summary: ${lesson.course.title} (${lesson.scheduledAt?.toISOString().slice(0, 10) ?? lessonId.slice(0, 8)})`,
        type: "lesson_summary",
        sourceType: "transcript",
        sourceRef: `lesson:${lessonId}`,
        content: summary + (actionItems.length ? "\n\nAction items:\n" + actionItems.map((a) => `- ${a}`).join("\n") : ""),
      },
      traceId,
    );

    return { summary, actionItems, knowledgeItemId: proposal.id };
  }
}
