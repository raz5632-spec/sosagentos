import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@salesos/db";
import { AppModule } from "../src/app.module.js";

const ADMIN_EMAIL = "raz5632@gmail.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "sos-dev-2026";
const STUDENT_EMAIL = "e2e-std@test.local";

describe("STD-001 student OS e2e", () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;
  let studentId: string;

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
    const u = await db.user.findUnique({ where: { email: STUDENT_EMAIL } });
    if (u) {
      await db.student.deleteMany({ where: { userId: u.id } });
      await db.membership.deleteMany({ where: { userId: u.id } });
      await db.auditEvent.deleteMany({ where: { subjectType: "student" } });
      await db.user.delete({ where: { id: u.id } });
    }
    await app.close();
  });

  it("enrolls a student: user + membership + profile", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/students`)
      .set("Authorization", `Bearer ${token}`)
      .send({ email: STUDENT_EMAIL, displayName: "E2E Student" })
      .expect(201);
    studentId = res.body.id;
    expect(res.body.stage).toBe("onboarding");
    expect(res.body.user.email).toBe(STUDENT_EMAIL);

    const u = await getDb().user.findUnique({
      where: { email: STUDENT_EMAIL },
      include: { memberships: { include: { role: true } } },
    });
    expect(u?.memberships.some((m) => m.role.code === "student" && m.orgId === orgId)).toBe(true);
  });

  it("double enrollment is rejected", async () => {
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/students`)
      .set("Authorization", `Bearer ${token}`)
      .send({ email: STUDENT_EMAIL, displayName: "E2E Student" })
      .expect(400);
  });

  it("coach note lands on the timeline", async () => {
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/students/${studentId}/notes`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "Missed two sessions; called and rescheduled." })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/students/${studentId}/timeline`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const note = res.body.find((e: { action: string }) => e.action === "student.note");
    expect(note.payloadJson.content).toContain("Missed two sessions");
  });

  it("assessment with unparseable model output degrades to needs_review (scores untouched)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/students/${studentId}/assess`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(res.body.verdict).toBe("needs_review");

    const student = await getDb().student.findUnique({ where: { id: studentId } });
    expect(student?.dropoutRisk).toBeNull();
  });

  it("intervention suggestions are parked for approval (L2)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/students/${studentId}/suggest`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(res.body.status).toBe("awaiting_approval");
    expect(res.body.nextAction).toMatch(/^approval:/);
  });

  it("students of another org are unreachable", async () => {
    await request(app.getHttpServer())
      .get(`/orgs/00000000-0000-0000-0000-000000000000/students/${studentId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
  });
});
