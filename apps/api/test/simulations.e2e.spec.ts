import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@salesos/db";
import { AppModule } from "../src/app.module.js";

const ADMIN_EMAIL = "raz5632@gmail.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "sos-dev-2026";

describe("SIM-001 digital twin e2e", () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;
  let reportId: string;

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
    if (reportId) await getDb().report.deleteMany({ where: { id: reportId } });
    await app.close();
  });

  it("runs a scenario and persists a simulation report grounded in KPIs", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/simulations`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        question: "What happens to retention if we add a weekly 1:1 for at-risk students?",
        assumptions: ["coach capacity allows 5 extra hours/week"],
      })
      .expect(201);
    reportId = res.body.id;
    expect(res.body.status).toBe("recommend_only");
    expect(res.body.memo).toContain("FAKE_COMPLETION");
    expect(res.body.kpiBaseline).toHaveProperty("students_total");

    const report = await getDb().report.findUnique({ where: { id: reportId } });
    expect(report?.type).toBe("simulation");
    expect((report?.bodyJson as { question: string }).question).toContain("retention");
  });

  it("lists simulations with their questions", async () => {
    const res = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/simulations`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const row = res.body.find((r: { id: string }) => r.id === reportId);
    expect(row.question).toContain("retention");
  });

  it("fetches a single simulation report", async () => {
    const res = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/simulations/${reportId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.bodyJson.kpiBaseline).toHaveProperty("ai_cost_usd_total");
  });

  it("question is required", async () => {
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/simulations`)
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(400);
  });
});
