import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@salesos/db";
import { AppModule } from "../src/app.module.js";

const ADMIN_EMAIL = "raz5632@gmail.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "sos-dev-2026";

const TRANSCRIPT = `Coach: Today we cover discovery calls. The key is asking open questions.
Student: How do I open the call?
Coach: Start with the prospect's world, not your pitch. Ask what prompted them to take the call.
Coach: Homework — record one discovery call and mark every closed question you asked.`;

describe("EDU-001 education pipeline e2e", () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;
  let courseId: string;
  let lessonId: string;
  let knowledgeItemId: string;

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
    if (lessonId) {
      await db.transcript.deleteMany({ where: { lessonId } });
      await db.lesson.deleteMany({ where: { id: lessonId } });
    }
    if (courseId) await db.course.deleteMany({ where: { id: courseId } });
    if (knowledgeItemId) {
      await db.knowledgeChunk.deleteMany({ where: { knowledgeItemId } });
      await db.knowledgeVersion.deleteMany({ where: { knowledgeItemId } });
      await db.knowledgeItem.deleteMany({ where: { id: knowledgeItemId } });
    }
    await app.close();
  });

  it("creates a course (audited)", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/courses`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "E2E Discovery Mastery" })
      .expect(201);
    courseId = res.body.id;
    expect(res.body.status).toBe("active");
  });

  it("lists courses with lesson counts", async () => {
    const res = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/courses`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const course = res.body.find((c: { id: string }) => c.id === courseId);
    expect(course._count.lessons).toBe(0);
  });

  it("creates a lesson under the course", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/courses/${courseId}/lessons`)
      .set("Authorization", `Bearer ${token}`)
      .send({ scheduledAt: "2026-07-01T18:00:00Z" })
      .expect(201);
    lessonId = res.body.id;
    expect(res.body.courseId).toBe(courseId);
  });

  it("rejects lessons under a course from another org", async () => {
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/courses/00000000-0000-0000-0000-000000000000/lessons`)
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(404);
  });

  it("ingests a transcript → summary + candidate knowledge proposal", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/lessons/${lessonId}/transcript`)
      .set("Authorization", `Bearer ${token}`)
      .send({ text: TRANSCRIPT })
      .expect(201);
    expect(res.body.summary).toBeTruthy();
    expect(res.body.knowledgeItemId).toBeTruthy();
    knowledgeItemId = res.body.knowledgeItemId;

    const item = await getDb().knowledgeItem.findUnique({ where: { id: knowledgeItemId } });
    expect(item?.status).toBe("candidate");
    expect(item?.type).toBe("lesson_summary");
    expect(item?.sourceRef).toBe(`lesson:${lessonId}`);
  });

  it("lesson detail includes the transcript", async () => {
    const res = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/lessons/${lessonId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.transcript.text).toContain("discovery calls");
    expect(res.body.course.title).toBe("E2E Discovery Mastery");
  });

  it("second transcript for the same lesson conflicts (409)", async () => {
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/lessons/${lessonId}/transcript`)
      .set("Authorization", `Bearer ${token}`)
      .send({ text: "duplicate" })
      .expect(409);
  });
});
