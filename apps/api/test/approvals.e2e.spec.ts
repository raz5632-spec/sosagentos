import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@salesos/db";
import { AppModule } from "../src/app.module.js";

// Requires the local dev database. Uses FakeProvider (no ANTHROPIC_API_KEY in test env).
const ADMIN_EMAIL = "raz5632@gmail.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "sos-dev-2026";

describe("GOV-001 approval engine e2e", () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;
  let approvalId: string;

  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY; // force FakeProvider
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

  it("L2 invoke without approval parks the task and creates a pending approval", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/agents/content_strategy/invoke`)
      .set("Authorization", `Bearer ${token}`)
      .send({ objective: "Draft a content plan for July", approvalLevel: "L2" })
      .expect(201);
    expect(res.body.status).toBe("awaiting_approval");
    expect(res.body.nextAction).toMatch(/^approval:/);
    approvalId = res.body.nextAction.split(":")[1];

    const approval = await getDb().approval.findUnique({ where: { id: approvalId } });
    expect(approval?.status).toBe("pending");
  });

  it("pending approval appears in the inbox with objective metadata", async () => {
    const res = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/approvals`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const row = res.body.find((a: { id: string }) => a.id === approvalId);
    expect(row).toBeTruthy();
    expect(row.objective).toContain("content plan");
    expect(row.approvalLevel).toBe("L2");
    expect(row.targetAgent).toBe("content_strategy");
  });

  it("approving executes the parked task and audits the decision", async () => {
    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/approvals/${approvalId}/approve`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(res.body.status).toBe("completed");
    expect(res.body.output.text).toContain("FAKE_COMPLETION");

    const db = getDb();
    const approval = await db.approval.findUnique({ where: { id: approvalId } });
    expect(approval?.status).toBe("approved");
    expect(approval?.decidedAt).toBeTruthy();

    const audit = await db.auditEvent.findFirst({
      where: { action: "approval.approved", subjectId: approvalId },
    });
    expect(audit).toBeTruthy();
  });

  it("approving twice conflicts (409)", async () => {
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/approvals/${approvalId}/approve`)
      .set("Authorization", `Bearer ${token}`)
      .expect(409);
  });

  it("rejecting a pending approval records the reason without executing", async () => {
    const invoke = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/agents/communications/invoke`)
      .set("Authorization", `Bearer ${token}`)
      .send({ objective: "Send campaign blast", approvalLevel: "L3" })
      .expect(201);
    const rejectId = invoke.body.nextAction.split(":")[1];

    const res = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/approvals/${rejectId}/reject`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "not this week" })
      .expect(201);
    expect(res.body.status).toBe("rejected");

    const approval = await getDb().approval.findUnique({ where: { id: rejectId } });
    expect(approval?.status).toBe("rejected");
    expect(approval?.decisionNote).toBe("not this week");
  });

  it("approvals of another org are not reachable (TenantGuard)", async () => {
    await request(app.getHttpServer())
      .get(`/orgs/00000000-0000-0000-0000-000000000000/approvals`)
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
  });
});
