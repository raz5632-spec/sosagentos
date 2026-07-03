import { BadRequestException, Injectable } from "@nestjs/common";
import { getDb, writeAudit } from "@salesos/db";

const GRAPH_URL = "https://graph.facebook.com/v21.0";

export interface NormalizedWhatsAppMessage {
  providerEventId: string;
  from: string;
  timestamp: string;
  type: string;
  text: string | null;
}

@Injectable()
export class WhatsAppService {
  /** Single-tenant v1: all webhook traffic maps to the sos org. */
  async defaultOrgId(): Promise<string> {
    const org = await getDb().organization.findUniqueOrThrow({ where: { slug: "sos" } });
    return org.id;
  }

  /** Ensure the integration_connections + webhook_endpoints rows exist. */
  async ensureConnection(orgId: string) {
    const db = getDb();
    let connection = await db.integrationConnection.findUnique({
      where: { orgId_provider: { orgId, provider: "meta_whatsapp" } },
    });
    if (!connection) {
      connection = await db.integrationConnection.create({
        data: {
          orgId,
          provider: "meta_whatsapp",
          scopesJson: ["whatsapp_business_management", "whatsapp_business_messaging"],
          status: "webhook_configured",
        },
      });
    }
    let endpoint = await db.webhookEndpoint.findFirst({
      where: { integrationConnectionId: connection.id, provider: "meta_whatsapp" },
    });
    if (!endpoint) {
      endpoint = await db.webhookEndpoint.create({
        data: {
          integrationConnectionId: connection.id,
          provider: "meta_whatsapp",
          url: "/webhooks/meta/whatsapp",
          verificationStatus: "pending",
        },
      });
    }
    return { connection, endpoint };
  }

  async markVerified(orgId: string) {
    const { endpoint } = await this.ensureConnection(orgId);
    await getDb().webhookEndpoint.update({
      where: { id: endpoint.id },
      data: { verificationStatus: "verified" },
    });
  }

  /** Extract supported message events from a webhook payload. */
  normalize(payload: unknown): NormalizedWhatsAppMessage[] {
    const out: NormalizedWhatsAppMessage[] = [];
    const body = payload as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            messages?: Array<{
              id: string;
              from: string;
              timestamp: string;
              type: string;
              text?: { body?: string };
            }>;
          };
        }>;
      }>;
    };
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const msg of change.value?.messages ?? []) {
          out.push({
            providerEventId: msg.id,
            from: msg.from,
            timestamp: msg.timestamp,
            type: msg.type,
            text: msg.text?.body ?? null,
          });
        }
      }
    }
    return out;
  }

  /** Persist raw payload idempotently; returns stored + duplicate counts. */
  async ingest(payload: unknown, traceId?: string) {
    const orgId = await this.defaultOrgId();
    const { endpoint } = await this.ensureConnection(orgId);
    const db = getDb();
    const messages = this.normalize(payload);

    let stored = 0;
    let duplicates = 0;
    for (const msg of messages) {
      try {
        await db.webhookEvent.create({
          data: {
            webhookEndpointId: endpoint.id,
            providerEventId: msg.providerEventId,
            status: "received",
            payloadJson: { raw: payload, normalized: msg } as object,
          },
        });
        stored++;
        await writeAudit({
          orgId,
          actorType: "system",
          actorId: "meta_webhook",
          action: "whatsapp.message_received",
          subjectType: "webhook_event",
          subjectId: msg.providerEventId,
          traceId,
          payload: { from: msg.from, type: msg.type },
        });
      } catch {
        duplicates++; // unique(webhookEndpointId, providerEventId) → idempotent replay
      }
    }

    if (messages.length === 0) {
      await writeAudit({
        orgId,
        actorType: "system",
        actorId: "meta_webhook",
        action: "whatsapp.unsupported_event",
        subjectType: "webhook_endpoint",
        subjectId: endpoint.id,
        traceId,
      });
    }
    return { received: messages.length, stored, duplicates };
  }

  async listMessages(orgId: string, limit = 50) {
    const { endpoint } = await this.ensureConnection(orgId);
    const rows = await getDb().webhookEvent.findMany({
      where: { webhookEndpointId: endpoint.id },
      orderBy: { receivedAt: "desc" },
      take: Math.min(limit, 200),
    });
    return rows.map((r) => ({
      id: r.id,
      receivedAt: r.receivedAt,
      status: r.status,
      message: (r.payloadJson as { normalized?: NormalizedWhatsAppMessage })?.normalized ?? null,
    }));
  }

  /** Execute an approved outbound send via the Graph API. */
  async executeSend(orgId: string, to: string, text: string, traceId?: string) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) {
      throw new BadRequestException(
        "whatsapp send not configured — WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required",
      );
    }
    const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { messages?: Array<{ id: string }> };
    if (!res.ok) {
      await writeAudit({
        orgId,
        actorType: "system",
        actorId: "whatsapp_sender",
        action: "whatsapp.send_failed",
        subjectType: "integration_connection",
        subjectId: "meta_whatsapp",
        traceId,
        payload: { to, status: res.status },
      });
      throw new BadRequestException(`whatsapp send failed: HTTP ${res.status}`);
    }
    await writeAudit({
      orgId,
      actorType: "system",
      actorId: "whatsapp_sender",
      action: "whatsapp.sent",
      subjectType: "integration_connection",
      subjectId: "meta_whatsapp",
      traceId,
      payload: { to, providerMessageId: body.messages?.[0]?.id ?? null },
    });
    return { sent: true, providerMessageId: body.messages?.[0]?.id ?? null };
  }
}
