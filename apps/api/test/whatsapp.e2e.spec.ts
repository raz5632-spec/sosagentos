import "reflect-metadata";
import { createHmac } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@salesos/db";
import { AppModule } from "../src/app.module.js";

const ADMIN_EMAIL = "raz5632@gmail.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "sos-dev-2026";
const VERIFY_TOKEN = "test-verify-token";
const APP_SECRET = "test-app-secret";

const EVENT_ID = `wamid.e2e-${Date.now()}`;
const WEBHOOK_PAYLOAD = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "waba-1",
      changes: [
        {
          field: "messages",
          value: {
            messages: [
              { id: EVENT_ID, from: "972500000000", timestamp: "1750000000", type: "text", text: { body: "היי, רוצה פרטים על הקורס" } },
            ],
          },
        },
      ],
    },
  ],
};

function sign(body: string) {
  return "sha256=" + createHmac("sha256", APP_SECRET).update(body).digest("hex");
}

describe("INT-META-001 WhatsApp webhook + gated send e2e", () => {
  let app: INestApplication;
  let token: string;
  let orgId: string;

  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.WHATSAPP_ACCESS_TOKEN; // send must fail cleanly when unconfigured
    process.env.META_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
    process.env.META_APP_SECRET = APP_SECRET;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
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
    await db.webhookEvent.deleteMany({ where: { providerEventId: EVENT_ID } });
    await db.approval.deleteMany({ where: { subjectType: "whatsapp_message" } });
    await app.close();
  });

  it("verification handshake succeeds with the right token", async () => {
    const res = await request(app.getHttpServer())
      .get("/webhooks/meta/whatsapp")
      .query({ "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "12345" })
      .expect(200);
    expect(res.text).toBe("12345");

    const endpoint = await getDb().webhookEndpoint.findFirst({ where: { provider: "meta_whatsapp" } });
    expect(endpoint?.verificationStatus).toBe("verified");
  });

  it("verification fails with a wrong token", async () => {
    await request(app.getHttpServer())
      .get("/webhooks/meta/whatsapp")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "x" })
      .expect(403);
  });

  it("rejects events with an invalid signature", async () => {
    await request(app.getHttpServer())
      .post("/webhooks/meta/whatsapp")
      .set("x-hub-signature-256", "sha256=deadbeef")
      .send(WEBHOOK_PAYLOAD)
      .expect(403);
  });

  it("stores a validly-signed message event", async () => {
    const body = JSON.stringify(WEBHOOK_PAYLOAD);
    const res = await request(app.getHttpServer())
      .post("/webhooks/meta/whatsapp")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", sign(body))
      .send(body)
      .expect(201);
    expect(res.body.stored).toBe(1);

    const event = await getDb().webhookEvent.findFirst({ where: { providerEventId: EVENT_ID } });
    expect(event).toBeTruthy();
  });

  it("bot drafted a reply and parked it for approval (FakeProvider → safe default)", async () => {
    // FakeProvider returns non-JSON, so the bot's safe default is sensitive=true → approval.
    const approval = await getDb().approval.findFirst({
      where: { subjectType: "whatsapp_message", subjectId: "972500000000", status: "pending" },
      orderBy: { createdAt: "desc" },
    });
    expect(approval).toBeTruthy();
    const payload = approval?.payloadJson as { reason?: string; text?: string };
    expect(payload.reason).toBe("unparseable_draft");
  });

  it("duplicate replay is idempotent", async () => {
    const body = JSON.stringify(WEBHOOK_PAYLOAD);
    const res = await request(app.getHttpServer())
      .post("/webhooks/meta/whatsapp")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", sign(body))
      .send(body)
      .expect(201);
    expect(res.body.stored).toBe(0);
    expect(res.body.duplicates).toBe(1);
  });

  it("inbound messages are listable from the console API", async () => {
    const res = await request(app.getHttpServer())
      .get(`/orgs/${orgId}/integrations/whatsapp/messages`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const row = res.body.find((m: { message?: { providerEventId?: string } }) => m.message?.providerEventId === EVENT_ID);
    expect(row.message.text).toContain("רוצה פרטים");
  });

  it("outbound send is parked for approval (L3), and approve fails cleanly when unconfigured", async () => {
    const send = await request(app.getHttpServer())
      .post(`/orgs/${orgId}/integrations/whatsapp/send`)
      .set("Authorization", `Bearer ${token}`)
      .send({ to: "972500000000", text: "תודה שפנית! נחזור אליך." })
      .expect(201);
    expect(send.body.status).toBe("awaiting_approval");

    await request(app.getHttpServer())
      .post(`/orgs/${orgId}/approvals/${send.body.approvalId}/approve`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400); // no WHATSAPP_ACCESS_TOKEN configured in tests
  });
});
