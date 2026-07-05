import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";

const ADMIN_EMAIL = "raz5632@gmail.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "sos-dev-2026";

describe("INT-CANVA-001 e2e", () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;

  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.CANVA_CLIENT_ID = "test-canva-id";
    process.env.CANVA_CLIENT_SECRET = "test-canva-secret";
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

  it("status reports not connected before OAuth", async () => {
    const res = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/integrations/canva/status`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.connected).toBe(false);
  });

  it("connect returns a PKCE authorization URL", async () => {
    const res = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/integrations/canva/connect`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.url).toContain("canva.com/api/oauth/authorize");
    expect(res.body.url).toContain("code_challenge_method=S256");
    expect(res.body.state).toBeTruthy();
  });

  it("callback with unknown state redirects to error", async () => {
    const res = await request(app.getHttpServer())
      .get("/integrations/canva/callback")
      .query({ code: "x", state: "bogus" })
      .expect(302);
    expect(res.headers.location).toContain("canva=error");
  });

  it("designs endpoint is guarded (managers only)", async () => {
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/integrations/canva/designs/nonexistent`)
      .expect(401);
  });
});
