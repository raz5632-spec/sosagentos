import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { getDb, writeAudit } from "@salesos/db";
import { AgentsService } from "../agents/agents.service.js";
import { DnaService } from "../dna/dna.service.js";

// Asset lifecycle: brief → drafted → in_review → approved (reject returns to drafted)

@Injectable()
export class ContentService {
  constructor(
    private readonly agents: AgentsService,
    private readonly dna: DnaService,
  ) {}

  async createBrief(
    orgId: string,
    actorUserId: string,
    input: { title: string; type?: string; targetChannel?: string; brief: string },
    traceId?: string,
  ) {
    const db = getDb();
    const asset = await db.contentAsset.create({
      data: {
        orgId,
        type: input.type ?? "post",
        title: input.title,
        status: "brief",
        targetChannel: input.targetChannel,
      },
    });
    await db.contentVersion.create({
      data: {
        contentAssetId: asset.id,
        versionNo: 1,
        bodyJson: { kind: "brief", brief: input.brief },
        qaStatus: "n/a",
      },
    });
    await writeAudit({
      orgId,
      actorType: "user",
      actorId: actorUserId,
      action: "content.brief_created",
      subjectType: "content_asset",
      subjectId: asset.id,
      traceId,
      payload: { title: input.title, targetChannel: input.targetChannel ?? null },
    });
    return { id: asset.id, status: asset.status, versionNo: 1 };
  }

  list(orgId: string, status?: string) {
    return getDb().contentAsset.findMany({
      where: { orgId, ...(status ? { status } : {}) },
      select: { id: true, title: true, type: true, status: true, targetChannel: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async get(orgId: string, id: string) {
    const asset = await getDb().contentAsset.findFirst({
      where: { id, orgId },
      include: { versions: { orderBy: { versionNo: "desc" } } },
    });
    if (!asset) throw new NotFoundException("content asset not found");
    return asset;
  }

  /** Draft: copy agent writes from the brief, then the DNA engine QAs the draft. */
  async draft(orgId: string, id: string, actorUserId: string, traceId?: string) {
    const asset = await this.get(orgId, id);
    if (!["brief", "drafted"].includes(asset.status)) {
      throw new ConflictException(`cannot draft from status ${asset.status}`);
    }
    const briefVersion = asset.versions.find(
      (v) => (v.bodyJson as { kind?: string })?.kind === "brief",
    );
    const brief = (briefVersion?.bodyJson as { brief?: string })?.brief;
    if (!brief) throw new BadRequestException("asset has no brief");

    const result = await this.agents.invoke(
      orgId,
      actorUserId,
      {
        agentCode: "copy",
        approvalLevel: "L1", // draft is internal; publication is gated separately
        objective: `Write the ${asset.type} content for channel ${asset.targetChannel ?? "general"} based on the brief. Match S.O.S. tone. Return the content text only.`,
        context: `BRIEF:\n${brief}`,
        budgetTokens: 2000,
      },
      traceId,
    );
    const draftText = ((result.output as { text?: string })?.text ?? "").trim();
    if (!draftText) throw new BadRequestException("copy agent returned no draft");

    // DNA QA — no active rules means a human must look (needs_review), never silent pass.
    let qaStatus = "qa_needs_review";
    let violations: unknown[] = [];
    try {
      const evaluation = await this.dna.evaluate(orgId, actorUserId, draftText, traceId);
      qaStatus =
        evaluation.verdict === "pass"
          ? "qa_passed"
          : evaluation.verdict === "fail"
            ? "qa_failed"
            : "qa_needs_review";
      violations = evaluation.violations;
    } catch {
      qaStatus = "qa_needs_review";
    }

    const versionNo = asset.versions[0].versionNo + 1;
    const db = getDb();
    await db.contentVersion.create({
      data: {
        contentAssetId: id,
        versionNo,
        bodyJson: { kind: "draft", text: draftText, dnaViolations: violations } as object,
        qaStatus,
      },
    });
    await db.contentAsset.update({ where: { id }, data: { status: "drafted" } });
    await writeAudit({
      orgId,
      actorType: "agent",
      actorId: "copy",
      action: "content.drafted",
      subjectType: "content_asset",
      subjectId: id,
      traceId,
      payload: { versionNo, qaStatus },
    });
    return { id, versionNo, qaStatus, draft: draftText, violations };
  }

  /** Submit the latest draft for human approval; qa_failed drafts are blocked. */
  async submit(orgId: string, id: string, actorUserId: string, traceId?: string) {
    const asset = await this.get(orgId, id);
    if (asset.status !== "drafted") {
      throw new ConflictException(`only drafted assets can be submitted (status=${asset.status})`);
    }
    const latest = asset.versions[0];
    if (latest.qaStatus === "qa_failed") {
      throw new ConflictException("latest draft failed DNA QA — redraft before submitting");
    }

    const db = getDb();
    await db.contentAsset.update({ where: { id }, data: { status: "in_review" } });
    const approval = await db.approval.create({
      data: {
        orgId,
        subjectType: "content_asset",
        subjectId: id,
        requestedBy: actorUserId,
        status: "pending",
        payloadJson: { title: asset.title, versionNo: latest.versionNo, qaStatus: latest.qaStatus },
      },
    });
    await writeAudit({
      orgId,
      actorType: "user",
      actorId: actorUserId,
      action: "content.submitted",
      subjectType: "content_asset",
      subjectId: id,
      traceId,
    });
    return { approvalId: approval.id, status: "in_review" };
  }

  /** Called by the approval engine. */
  async approveAsset(orgId: string, id: string, approverUserId: string, traceId?: string) {
    const db = getDb();
    const asset = await db.contentAsset.findFirst({
      where: { id, orgId },
      include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } },
    });
    if (!asset) throw new NotFoundException("content asset not found");

    await db.contentVersion.update({
      where: { id: asset.versions[0].id },
      data: { qaStatus: "approved" },
    });
    await db.contentAsset.update({ where: { id }, data: { status: "approved" } });
    await writeAudit({
      orgId,
      actorType: "user",
      actorId: approverUserId,
      action: "content.approved",
      subjectType: "content_asset",
      subjectId: id,
      traceId,
    });
    return { id, status: "approved" };
  }

  async demoteAsset(orgId: string, id: string) {
    await getDb().contentAsset.updateMany({ where: { id, orgId }, data: { status: "drafted" } });
    return { id, status: "drafted" };
  }
}
