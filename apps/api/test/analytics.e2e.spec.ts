import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@salesos/db";
import { AppModule } from "../src/app.module.js";

const ADMIN_EMAIL = "raz5632@gmail.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "sos-dev-2026";

describe("ANA-001 analytics + CEO dashboard e2e", () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;
  let snapshotTs: string;

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
    if (snapshotTs) {
      await getDb().kpiSnapshot.deleteMany({ where: { orgId, ts: new Date(snapshotTs) } });
    }
    await app.close();
  });

  it("dashboard returns KPI block, approvals, AI activity and trend", async () => {
    // Ensure at least one invocation exists regardless of suite ordering.
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/agents/analytics/invoke`)
      .set("Authorization", `Bearer ${token}`)
      .send({ objective: "ANA e2e warmup", approvalLevel: "L1" })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/dashboard`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.kpis).toHaveProperty("students_total");
    expect(res.body.kpis).toHaveProperty("approvals_pending");
    expect(res.body.kpis).toHaveProperty("ai_cost_usd_total");
    expect(res.body.kpis.ai_invocations_total).toBeGreaterThan(0);
    expect(Array.isArray(res.body.pendingApprovals)).toBe(true);
    expect(Array.isArray(res.body.recentAiActivity)).toBe(true);
    expect(Array.isArray(res.body.aiCostTrend)).toBe(true);
  });

  it("snapshot persists one row per metric", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/analytics/snapshot`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    snapshotTs = res.body.ts;
    const metricCount = Object.keys(res.body.metrics).length;
    expect(metricCount).toBeGreaterThanOrEqual(8);

    const rows = await getDb().kpiSnapshot.findMany({
      where: { orgId, ts: new Date(snapshotTs) },
    });
    expect(rows).toHaveLength(metricCount);
  });

  it("dashboard is denied to non-managers (RolesGuard)", async () => {
    // enroll a throwaway student user and try the dashboard with it
    const email = "e2e-ana-student@test.local";
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/students`)
      .set("Authorization", `Bearer ${token}`)
      .send({ email, displayName: "Ana Student" })
      .expect(201);
    const db = getDb();
    const bcrypt = await import("bcryptjs");
    await db.user.update({
      where: { email },
      data: { passwordHash: await bcrypt.default.hash("temp-pass-1", 10) },
    });
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password: "temp-pass-1" })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/orgs/${orgId}/dashboard`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(403);

    // cleanup
    const u = await db.user.findUnique({ where: { email } });
    if (u) {
      await db.student.deleteMany({ where: { userId: u.id } });
      await db.membership.deleteMany({ where: { userId: u.id } });
      await db.auditEvent.deleteMany({ where: { actorId: u.id } });
      await db.user.delete({ where: { id: u.id } });
    }
  });
});
