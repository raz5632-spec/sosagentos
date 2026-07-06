import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@salesos/db";
import { AppModule } from "../src/app.module.js";
import { chunkText } from "../src/knowledge/knowledge.service.js";

const ADMIN_EMAIL = "raz5632@gmail.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "sos-dev-2026";

const LONG_CONTENT = Array.from({ length: 8 })
  .map((_, i) => `Sales objection handling principle ${i + 1}: ` + "listen first, then reframe. ".repeat(20))
  .join("\n\n");

describe("chunkText", () => {
  it("splits long content into multiple chunks under the limit", () => {
    const chunks = chunkText(LONG_CONTENT, 1500);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1600);
  });

  it("returns one chunk for short content", () => {
    expect(chunkText("short note")).toEqual(["short note"]);
  });
});

describe("KNO-001 knowledge pipeline e2e", () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;
  let itemId: string;
  let approvalId: string;

  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(201);
    token = login.body.token;
    orgId = login.body.organizations[0].orgId;
  });

  afterAll(async () => {
    await app.close();
  });

  it("captures content as a candidate item with version + chunks", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/knowledge`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Objection handling playbook", type: "playbook", content: LONG_CONTENT })
      .expect(201);
    expect(res.body.status).toBe("candidate");
    expect(res.body.versionNo).toBe(1);
    expect(res.body.chunks).toBeGreaterThan(1);
    itemId = res.body.id;
  });

  it("returns the item with ordered chunks and versions", async () => {
    const res = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/knowledge/${itemId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.versions).toHaveLength(1);
    expect(res.body.chunks[0].seq).toBe(0);
  });

  it("submit moves item to in_review and lands in the approvals inbox", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/knowledge/${itemId}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    approvalId = res.body.approvalId;

    const inbox = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/approvals`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const row = inbox.body.find((a: { id: string }) => a.id === approvalId);
    expect(row.subjectType).toBe("knowledge_item");
    expect(row.objective).toBe("Objection handling playbook");
  });

  it("double submit conflicts (409)", async () => {
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/knowledge/${itemId}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .expect(409);
  });

  it("approving promotes to production and stamps the version", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/approvals/${approvalId}/approve`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(res.body.status).toBe("production");

    const item = await getDb().knowledgeItem.findUnique({
      where: { id: itemId },
      include: { versions: true },
    });
    expect(item?.status).toBe("production");
    expect(item?.versions[0].approvedBy).toBeTruthy();
    expect(item?.versions[0].approvedAt).toBeTruthy();
  });

  it("rejecting a submitted item returns it to candidate", async () => {
    const capture = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/knowledge`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Draft idea", content: "some rough idea" })
      .expect(201);
    const submit = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/knowledge/${capture.body.id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/approvals/${submit.body.approvalId}/reject`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "needs sources" })
      .expect(201);

    const item = await getDb().knowledgeItem.findUnique({ where: { id: capture.body.id } });
    expect(item?.status).toBe("candidate");
  });
});

describe("KNO-001b file upload + teaching e2e", () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;
  let uploadedId: string;

  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(201);
    token = login.body.token;
    orgId = login.body.organizations[0].orgId;
  });

  afterAll(async () => {
    const db = getDb();
    if (uploadedId) {
      await db.knowledgeChunk.deleteMany({ where: { knowledgeItemId: uploadedId } });
      await db.knowledgeItem.updateMany({ where: { id: uploadedId }, data: { currentVersionId: null } });
      await db.knowledgeVersion.deleteMany({ where: { knowledgeItemId: uploadedId } });
      await db.knowledgeItem.deleteMany({ where: { id: uploadedId } });
    }
    await app.close();
  });

  it("uploads a text file and promotes it straight to production", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/knowledge/upload`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("מפת שיחת המכירה: פתיחה, זיהוי כאב, הצגת ערך, טיפול בהתנגדות, סגירה."), "sales-map.txt")
      .field("title", "מפת שיחת מכירה")
      .expect(201);
    expect(res.body.status).toBe("production");
    expect(res.body.chars).toBeGreaterThan(10);
    uploadedId = res.body.id;

    const item = await getDb().knowledgeItem.findUnique({ where: { id: uploadedId } });
    expect(item?.status).toBe("production");
    expect(item?.sourceType).toBe("file_upload");
  });

  it("rejects an upload with no file", async () => {
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/knowledge/upload`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
  });
});

describe("KNO-002 semantic search + graph e2e", () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;
  let salesItemId: string;
  let cookingItemId: string;

  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(201);
    token = login.body.token;
    orgId = login.body.organizations[0].orgId;

    // Idempotency: remove items left behind by previous runs of this suite.
    const db = getDb();
    const stale = await db.knowledgeItem.findMany({
      where: { orgId, title: { in: ["Handling price objections", "Pasta cooking basics"] } },
      select: { id: true },
    });
    const staleIds = stale.map((s) => s.id);
    if (staleIds.length) {
      await db.knowledgeEdge.deleteMany({ where: { OR: [{ fromItemId: { in: staleIds } }, { toItemId: { in: staleIds } }] } });
      await db.knowledgeChunk.deleteMany({ where: { knowledgeItemId: { in: staleIds } } });
      await db.knowledgeItem.updateMany({ where: { id: { in: staleIds } }, data: { currentVersionId: null } });
      await db.knowledgeVersion.deleteMany({ where: { knowledgeItemId: { in: staleIds } } });
      await db.approval.deleteMany({ where: { subjectType: "knowledge_item", subjectId: { in: staleIds } } });
      await db.knowledgeItem.deleteMany({ where: { id: { in: staleIds } } });
    }

    const capture = async (title: string, content: string) => {
      const res = await request(app.getHttpServer())
        .post(`/orgs/${orgId}/knowledge`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title, content })
        .expect(201);
      const submit = await request(app.getHttpServer())
        .post(`/orgs/${orgId}/knowledge/${res.body.id}/submit`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/orgs/${orgId}/approvals/${submit.body.approvalId}/approve`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);
      return res.body.id as string;
    };

    salesItemId = await capture(
      "Handling price objections",
      "When a prospect raises a price objection, acknowledge the concern, restate the value, and anchor against the cost of inaction. Price objections usually hide a value gap.",
    );
    cookingItemId = await capture(
      "Pasta cooking basics",
      "Boil water with plenty of salt, cook the pasta until al dente, and always reserve some pasta water for the sauce.",
    );
  });

  afterAll(async () => {
    const db = getDb();
    const ids = [salesItemId, cookingItemId].filter(Boolean);
    await db.knowledgeEdge.deleteMany({ where: { OR: [{ fromItemId: { in: ids } }, { toItemId: { in: ids } }] } });
    await db.knowledgeChunk.deleteMany({ where: { knowledgeItemId: { in: ids } } });
    await db.knowledgeItem.updateMany({ where: { id: { in: ids } }, data: { currentVersionId: null } });
    await db.knowledgeVersion.deleteMany({ where: { knowledgeItemId: { in: ids } } });
    await db.approval.deleteMany({ where: { subjectType: "knowledge_item", subjectId: { in: ids } } });
    await db.knowledgeItem.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  it("search ranks the topically-matching item first", async () => {
    const res = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/knowledge/search`)
      .query({ q: "how do I answer a price objection from a prospect" })
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].itemId).toBe(salesItemId);
    expect(res.body[0].score).toBeGreaterThan(res.body.find((r: any) => r.itemId === cookingItemId)?.score ?? 0);
  });

  it("search requires a query", async () => {
    await request(app.getHttpServer())
      .get(`/orgs/${orgId}/knowledge/search`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
  });

  it("creates and reads graph edges in both directions", async () => {
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/knowledge/${salesItemId}/edges`)
      .set("Authorization", `Bearer ${token}`)
      .send({ toItemId: cookingItemId, relationType: "related_to", weight: 0.4 })
      .expect(201);

    const out = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/knowledge/${salesItemId}/edges`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(out.body.outgoing[0].item.id).toBe(cookingItemId);

    const inn = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/knowledge/${cookingItemId}/edges`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(inn.body.incoming[0].item.id).toBe(salesItemId);
  });

  it("rejects edges to items outside the org", async () => {
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/knowledge/${salesItemId}/edges`)
      .set("Authorization", `Bearer ${token}`)
      .send({ toItemId: "00000000-0000-0000-0000-000000000000", relationType: "related_to" })
      .expect(404);
  });
});
