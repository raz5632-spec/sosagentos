import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@salesos/db";
import { AppModule } from "../src/app.module.js";

const ADMIN_EMAIL = "raz5632@gmail.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "sos-dev-2026";

describe("CNT-001 content engine e2e", () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;
  let assetId: string;
  let ruleId: string;
  let approvalId: string;

  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY; // FakeProvider → DNA verdict degrades to needs_review
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(201);
    token = login.body.token;
    orgId = login.body.organizations[0].orgId;

    // DNA evaluation requires at least one active rule.
    const rule = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/dna/rules`)
      .set("Authorization", `Bearer ${token}`)
      .send({ ruleType: "tone", ruleText: "E2E-CNT: no hype, no income promises", severity: "major" })
      .expect(201);
    ruleId = rule.body.id;
  });

  afterAll(async () => {
    const db = getDb();
    if (assetId) {
      await db.approval.deleteMany({ where: { subjectType: "content_asset", subjectId: assetId } });
      await db.contentVersion.deleteMany({ where: { contentAssetId: assetId } });
      await db.contentAsset.deleteMany({ where: { id: assetId } });
    }
    if (ruleId) await db.brandRule.deleteMany({ where: { id: ruleId } });
    await app.close();
  });

  it("creates a brief (version 1)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/content/briefs`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "E2E Reel: discovery questions",
        type: "reel_script",
        targetChannel: "instagram",
        brief: "60-second reel teaching 3 discovery questions that uncover the prospect's real pain.",
      })
      .expect(201);
    assetId = res.body.id;
    expect(res.body.status).toBe("brief");
  });

  it("draft runs the copy agent + DNA QA and stores version 2", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/content/${assetId}/draft`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(res.body.versionNo).toBe(2);
    expect(res.body.draft).toContain("FAKE_COMPLETION");
    expect(res.body.qaStatus).toBe("qa_needs_review"); // fake provider → unparseable DNA verdict

    const asset = await getDb().contentAsset.findUnique({ where: { id: assetId } });
    expect(asset?.status).toBe("drafted");
  });

  it("submit parks the asset in the approvals inbox", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/content/${assetId}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    approvalId = res.body.approvalId;

    const inbox = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/approvals`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const row = inbox.body.find((a: { id: string }) => a.id === approvalId);
    expect(row.subjectType).toBe("content_asset");
    expect(row.objective).toBe("E2E Reel: discovery questions");
  });

  it("draft is blocked while in review", async () => {
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/content/${assetId}/draft`)
      .set("Authorization", `Bearer ${token}`)
      .expect(409);
  });

  it("approve finalizes the asset and stamps the version", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/approvals/${approvalId}/approve`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(res.body.status).toBe("approved");

    const asset = await getDb().contentAsset.findUnique({
      where: { id: assetId },
      include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } },
    });
    expect(asset?.status).toBe("approved");
    expect(asset?.versions[0].qaStatus).toBe("approved");
  });

  it("rejecting a submitted asset returns it to drafted", async () => {
    const brief = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/content/briefs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "E2E throwaway", brief: "short brief" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/content/${brief.body.id}/draft`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    const submit = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/content/${brief.body.id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/approvals/${submit.body.approvalId}/reject`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "off-brand" })
      .expect(201);

    const asset = await getDb().contentAsset.findUnique({ where: { id: brief.body.id } });
    expect(asset?.status).toBe("drafted");

    // cleanup
    const db = getDb();
    await db.approval.deleteMany({ where: { subjectId: brief.body.id } });
    await db.contentVersion.deleteMany({ where: { contentAssetId: brief.body.id } });
    await db.contentAsset.deleteMany({ where: { id: brief.body.id } });
  });
});
