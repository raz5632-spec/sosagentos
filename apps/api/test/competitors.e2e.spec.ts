import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@salesos/db";
import { AppModule } from "../src/app.module.js";

const ADMIN_EMAIL = "raz5632@gmail.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "sos-dev-2026";

describe("CMP-001 competitor intelligence e2e", () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;
  let competitorId: string;

  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY; // FakeProvider
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
    if (competitorId) {
      await db.competitorObservation.deleteMany({ where: { competitorId } });
      await db.competitor.deleteMany({ where: { id: competitorId } });
    }
    await app.close();
  });

  it("registers a competitor", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/competitors`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "E2E Rival Coaching", handle: "@rival", channels: ["instagram", "youtube"] })
      .expect(201);
    competitorId = res.body.id;
    expect(res.body.trackingStatus).toBe("active");
  });

  it("analyze without observations is rejected", async () => {
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/competitors/${competitorId}/analyze`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
  });

  it("records observations (coach allowed)", async () => {
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/competitors/${competitorId}/observations`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        summary: "Launched a 5-day objection-handling challenge, heavy reels push",
        contentType: "reel",
        url: "https://instagram.com/p/example",
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/competitors/${competitorId}/observations`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].summary).toContain("objection-handling challenge");
  });

  it("analysis with unparseable model output degrades to needs_review (no decision rows)", async () => {
    const before = await getDb().decision.count({ where: { orgId, type: "competitor_opportunity" } });
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/competitors/${competitorId}/analyze`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(res.body.verdict).toBe("needs_review");
    const after = await getDb().decision.count({ where: { orgId, type: "competitor_opportunity" } });
    expect(after).toBe(before);
  });

  it("competitors of other orgs are unreachable", async () => {
    await request(app.getHttpServer())
      .get(`/orgs/00000000-0000-0000-0000-000000000000/competitors`)
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
  });
});
