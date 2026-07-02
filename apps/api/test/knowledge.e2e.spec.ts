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
