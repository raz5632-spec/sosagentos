import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@salesos/db";
import { AppModule } from "../src/app.module.js";

const ADMIN_EMAIL = "raz5632@gmail.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "sos-dev-2026";

describe("AUT-001 workflow runner e2e", () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;
  let wfId: string;
  let blockedWfId: string;

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
    for (const id of [wfId, blockedWfId].filter(Boolean)) {
      const runs = await db.workflowRun.findMany({ where: { workflowId: id } });
      await db.taskRun.deleteMany({ where: { workflowRunId: { in: runs.map((r) => r.id) } } });
      await db.workflowRun.deleteMany({ where: { workflowId: id } });
      await db.workflowVersion.deleteMany({ where: { workflowId: id } });
      await db.workflow.deleteMany({ where: { id } });
    }
    await app.close();
  });

  it("creates a workflow with an active version", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/workflows`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        code: "e2e_weekly_digest",
        name: "Weekly digest",
        steps: [
          { agentCode: "analytics", objective: "Summarize weekly KPIs", approvalLevel: "L1" },
          { agentCode: "research", objective: "List 3 market signals to watch", approvalLevel: "L1" },
        ],
      })
      .expect(201);
    wfId = res.body.id;
    expect(res.body.semver).toBe("1.0.0");
  });

  it("duplicate workflow code conflicts", async () => {
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/workflows`)
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "e2e_weekly_digest", name: "dup", steps: [{ agentCode: "analytics", objective: "x" }] })
      .expect(409);
  });

  it("runs all L1 steps to completion", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/workflows/${wfId}/run`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(res.body.status).toBe("completed");
    expect(res.body.taskRuns).toHaveLength(2);
    expect(res.body.taskRuns.every((t: { status: string }) => t.status === "completed")).toBe(true);
  });

  it("an L2 step parks and blocks the run", async () => {
    const created = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/workflows`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        code: "e2e_gated_flow",
        name: "Gated flow",
        steps: [
          { agentCode: "analytics", objective: "prep data", approvalLevel: "L1" },
          { agentCode: "communications", objective: "send weekly update to students", approvalLevel: "L3" },
        ],
      })
      .expect(201);
    blockedWfId = created.body.id;

    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/workflows/${blockedWfId}/run`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(res.body.status).toBe("blocked");
    const statuses = res.body.taskRuns.map((t: { status: string }) => t.status);
    expect(statuses).toContain("awaiting_approval");
  });

  it("lists runs with task details", async () => {
    const res = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/workflows/${wfId}/runs`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body[0].taskRuns.length).toBeGreaterThan(0);
  });
});
