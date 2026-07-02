import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { getDb, writeAudit } from "@salesos/db";

/** Simple sentence-aware chunker (~1500 chars, embeddings arrive in KNO-002). */
export function chunkText(text: string, maxLen = 1500): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if ((current + "\n\n" + p).length > maxLen && current) {
      chunks.push(current.trim());
      current = p;
    } else {
      current = current ? current + "\n\n" + p : p;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text.trim()];
}

@Injectable()
export class KnowledgeService {
  /** Capture: create a candidate knowledge item with version 1 + chunks. */
  async capture(
    orgId: string,
    actorUserId: string,
    input: { title: string; type: string; sourceType: string; sourceRef?: string; content: string },
    traceId?: string,
  ) {
    if (!input.content?.trim()) throw new BadRequestException("content is required");
    const db = getDb();

    const item = await db.knowledgeItem.create({
      data: {
        orgId,
        type: input.type,
        title: input.title,
        status: "candidate",
        sourceType: input.sourceType,
        sourceRef: input.sourceRef,
      },
    });

    const version = await db.knowledgeVersion.create({
      data: {
        knowledgeItemId: item.id,
        versionNo: 1,
        contentHash: createHash("sha256").update(input.content).digest("hex"),
      },
    });
    await db.knowledgeItem.update({
      where: { id: item.id },
      data: { currentVersionId: version.id },
    });

    const chunks = chunkText(input.content);
    await db.knowledgeChunk.createMany({
      data: chunks.map((content, seq) => ({
        knowledgeItemId: item.id,
        seq,
        content,
        tokenCount: Math.ceil(content.length / 4),
      })),
    });

    await writeAudit({
      orgId,
      actorType: "user",
      actorId: actorUserId,
      action: "knowledge.captured",
      subjectType: "knowledge_item",
      subjectId: item.id,
      traceId,
      payload: { title: input.title, chunks: chunks.length },
    });

    return { id: item.id, status: "candidate", versionNo: 1, chunks: chunks.length };
  }

  async list(orgId: string, status?: string) {
    return getDb().knowledgeItem.findMany({
      where: { orgId, ...(status ? { status } : {}) },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        sourceType: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async get(orgId: string, id: string) {
    const item = await getDb().knowledgeItem.findFirst({
      where: { id, orgId },
      include: {
        versions: { orderBy: { versionNo: "desc" } },
        chunks: { orderBy: { seq: "asc" }, select: { seq: true, content: true, tokenCount: true } },
      },
    });
    if (!item) throw new NotFoundException("knowledge item not found");
    return item;
  }

  /** Submit a candidate for promotion — creates a pending Approval (GOV-001 inbox). */
  async submitForApproval(orgId: string, id: string, actorUserId: string, traceId?: string) {
    const db = getDb();
    const item = await db.knowledgeItem.findFirst({ where: { id, orgId } });
    if (!item) throw new NotFoundException("knowledge item not found");
    if (item.status !== "candidate") {
      throw new ConflictException(`item is ${item.status}, only candidates can be submitted`);
    }

    await db.knowledgeItem.update({ where: { id }, data: { status: "in_review" } });
    const approval = await db.approval.create({
      data: {
        orgId,
        subjectType: "knowledge_item",
        subjectId: id,
        requestedBy: actorUserId,
        status: "pending",
        payloadJson: { title: item.title, type: item.type },
      },
    });
    await writeAudit({
      orgId,
      actorType: "user",
      actorId: actorUserId,
      action: "knowledge.submitted",
      subjectType: "knowledge_item",
      subjectId: id,
      traceId,
    });
    return { approvalId: approval.id, status: "in_review" };
  }

  /** Promote to production (called by the approval engine on approve). */
  async promote(orgId: string, id: string, approverUserId: string, traceId?: string) {
    const db = getDb();
    const item = await db.knowledgeItem.findFirst({ where: { id, orgId } });
    if (!item) throw new NotFoundException("knowledge item not found");

    if (item.currentVersionId) {
      await db.knowledgeVersion.update({
        where: { id: item.currentVersionId },
        data: { approvedBy: approverUserId, approvedAt: new Date() },
      });
    }
    await db.knowledgeItem.update({ where: { id }, data: { status: "production" } });
    await writeAudit({
      orgId,
      actorType: "user",
      actorId: approverUserId,
      action: "knowledge.promoted",
      subjectType: "knowledge_item",
      subjectId: id,
      traceId,
    });
    return { id, status: "production" };
  }

  /** Return a rejected candidate to candidate state. */
  async demote(orgId: string, id: string, traceId?: string) {
    await getDb().knowledgeItem.updateMany({
      where: { id, orgId },
      data: { status: "candidate" },
    });
    return { id, status: "candidate" };
  }
}
