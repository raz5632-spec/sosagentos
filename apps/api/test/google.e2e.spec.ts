import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";

const ADMIN_EMAIL = "raz5632@gmail.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "sos-dev-2026";

describe("INT-GGL-001 e2e", () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;

  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.GOOGLE_OAUTH_CLIENT_ID = "test-google-id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-google-secret";
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

  it("status is not connected before OAuth", async () => {
    const res = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/integrations/google/status`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.connected).toBe(false);
  });

  it("connect returns a Google authorization URL with offline access", async () => {
    const res = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/integrations/google/connect`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.url).toContain("accounts.google.com");
    expect(res.body.url).toContain("access_type=offline");
    expect(res.body.url).toContain("gmail.readonly");
  });

  it("callback with unknown state redirects to error", async () => {
    const res = await request(app.getHttpServer())
      .get("/integrations/google/callback")
      .query({ code: "x", state: "bogus" })
      .expect(302);
    expect(res.headers.location).toContain("google=error");
  });

  it("gmail import is guarded", async () => {
    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/integrations/google/import/gmail`)
      .expect(401);
  });
});
