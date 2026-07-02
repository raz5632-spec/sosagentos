import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@salesos/db";
import { AppModule } from "../src/app.module.js";

// Requires the local dev database (docker compose up + migrate + seed).
const ADMIN_EMAIL = "raz5632@gmail.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "sos-dev-2026";

describe("IAM-001 e2e", () => {
  let app: INestApplication;
  let adminToken: string;
  let orgId: string;
  let studentToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    const db = getDb();
    // Clean up the member created by this run so the suite is idempotent.
    const u = await db.user.findUnique({ where: { email: "e2e-student@test.local" } });
    if (u) {
      await db.membership.deleteMany({ where: { userId: u.id } });
      await db.auditEvent.deleteMany({ where: { actorId: u.id } });
      await db.user.delete({ where: { id: u.id } });
    }
    await app.close();
  });

  it("healthz responds", async () => {
    const res = await request(app.getHttpServer()).get("/healthz").expect(200);
    expect(res.body.status).toBe("ok");
  });

  it("rejects bad credentials", async () => {
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: ADMIN_EMAIL, password: "wrong-password" })
      .expect(401);
  });

  it("logs in the seeded admin and returns org memberships", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.organizations[0].role).toBe("owner");
    adminToken = res.body.token;
    orgId = res.body.organizations[0].orgId;
  });

  it("GET /auth/me returns the profile", async () => {
    const res = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.email).toBe(ADMIN_EMAIL);
  });

  it("rejects requests without a token", async () => {
    await request(app.getHttpServer()).get(`/orgs/${"0".repeat(36)}/members`).expect(401);
  });

  it("owner can list members", async () => {
    const res = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/members`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.some((m: { email: string }) => m.email === ADMIN_EMAIL)).toBe(true);
  });

  it("owner can add a student member (audited)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/members`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        email: "e2e-student@test.local",
        displayName: "E2E Student",
        roleCode: "student",
        password: "student-pass-1",
      })
      .expect(201);
    expect(res.body.role).toBe("student");

    const audit = await getDb().auditEvent.findFirst({
      where: { action: "membership.created", subjectId: { not: "" }, orgId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
  });

  it("granting owner role via API is refused", async () => {
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/members`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: "evil@test.local", displayName: "X", roleCode: "owner" })
      .expect(400);
  });

  it("student cannot list members (RolesGuard)", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "e2e-student@test.local", password: "student-pass-1" })
      .expect(201);
    studentToken = login.body.token;

    await request(app.getHttpServer())
      .get(`/orgs/${orgId}/members`)
      .set("Authorization", `Bearer ${studentToken}`)
      .expect(403);
  });

  it("member of org A cannot access org B (TenantGuard)", async () => {
    const otherOrg = "00000000-0000-0000-0000-000000000000";
    await request(app.getHttpServer())
      .get(`/orgs/${otherOrg}/members`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(403);
  });
});
