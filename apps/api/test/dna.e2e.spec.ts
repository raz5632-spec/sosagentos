import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@salesos/db";
import { AppModule } from "../src/app.module.js";

const ADMIN_EMAIL = "raz5632@gmail.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "sos-dev-2026";

describe("DNA-001 organizational DNA engine e2e", () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;
  let ruleId: string;

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
    await getDb().brandRule.deleteMany({ where: { orgId, ruleText: { contains: "E2E:" } } });
    await app.close();
  });

  it("creates a brand rule (audited)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/dna/rules`)
      .set("Authorization", `Bearer ${token}`)
      .send({ ruleType: "prohibited_claim", ruleText: "E2E: never promise guaranteed income", severity: "critical" })
      .expect(201);
    ruleId = res.body.id;
    expect(res.body.active).toBe(true);

    const audit = await getDb().auditEvent.findFirst({
      where: { action: "brand_rule.created", subjectId: ruleId },
    });
    expect(audit).toBeTruthy();
  });

  it("lists active rules", async () => {
    const res = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/dna/rules`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.some((r: { id: string }) => r.id === ruleId)).toBe(true);
  });

  it("evaluates content via the brand_dna agent (fake provider → needs_review)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/dna/evaluate`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "Join now and you are guaranteed to triple your income!" })
      .expect(201);
    // FakeProvider returns non-JSON text → graceful degradation
    expect(res.body.verdict).toBe("needs_review");
    expect(res.body.raw).toContain("FAKE_COMPLETION");
  });

  it("evaluation requires content and at least one active rule", async () => {
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/dna/evaluate`)
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(400);
  });

  it("deactivates a rule; it disappears from the active list", async () => {
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/dna/rules/${ruleId}/deactivate`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/dna/rules`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.some((r: { id: string }) => r.id === ruleId)).toBe(false);
  });
});
