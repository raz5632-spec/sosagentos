import { BadRequestException, Injectable } from "@nestjs/common";
import { getDb, writeAudit } from "@salesos/db";
import { AgentsService } from "../../agents/agents.service.js";
import { DnaService } from "../../dna/dna.service.js";

const GRAPH_URL = "https://graph.facebook.com/v21.0";

// Autonomy policy (CEO decision 2026-07-05, "option A"): the bot replies
// autonomously to operational questions; sensitive topics (pricing, complaints,
// refunds, commitments) and DNA failures are parked in the approvals inbox.

export interface NormalizedWhatsAppMessage {
  providerEventId: string;
  from: string;
  timestamp: string;
  type: string;
  text: string | null;
}

@Injectable()
export class WhatsAppService {
  constructor(
    private readonly agents: AgentsService,
    private readonly dna: DnaService,
  ) {}

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

    // Conversational bot: reply to each newly-stored text message.
    for (const msg of messages) {
      if (msg.text && stored > 0) {
        try {
          await this.autoReply(orgId, msg, traceId);
        } catch (err) {
          await writeAudit({
            orgId,
            actorType: "system",
            actorId: "whatsapp_bot",
            action: "whatsapp.bot_error",
            subjectType: "webhook_event",
            subjectId: msg.providerEventId,
            traceId,
            payload: { error: String(err) },
          });
        }
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

  /** Recent inbound texts from a sender, oldest first — conversation context. */
  private async history(endpointId: string, from: string, take = 10) {
    const rows = await getDb().webhookEvent.findMany({
      where: { webhookEndpointId: endpointId },
      orderBy: { receivedAt: "desc" },
      take: 50,
    });
    return rows
      .map((r) => (r.payloadJson as { normalized?: NormalizedWhatsAppMessage })?.normalized)
      .filter((m): m is NormalizedWhatsAppMessage => !!m && m.from === from && !!m.text)
      .slice(0, take)
      .reverse();
  }

  /** Park a drafted reply in the approvals inbox (sensitive / DNA-failed / send-failed). */
  private async parkReply(orgId: string, to: string, draft: string, reason: string, traceId?: string) {
    const approval = await getDb().approval.create({
      data: {
        orgId,
        subjectType: "whatsapp_message",
        subjectId: to,
        requestedBy: "whatsapp_bot",
        status: "pending",
        payloadJson: { title: `WhatsApp → ${to} (${reason})`, to, text: draft, reason },
      },
    });
    await writeAudit({
      orgId,
      actorType: "agent",
      actorId: "whatsapp_bot",
      action: "whatsapp.reply_parked",
      subjectType: "approval",
      subjectId: approval.id,
      traceId,
      payload: { to, reason },
    });
    return approval;
  }

  /**
   * Option-A autonomy: draft a reply via the communications agent; auto-send
   * unless the agent flags it sensitive, DNA fails it, or the send fails.
   */
  async autoReply(orgId: string, msg: NormalizedWhatsAppMessage, traceId?: string) {
    const { endpoint } = await this.ensureConnection(orgId);
    const history = await this.history(endpoint.id, msg.from);
    const historyText = history.map((h) => `- ${h.text}`).join("\n");

    const result = await this.agents.invoke(
      orgId,
      "whatsapp_bot",
      {
        agentCode: "communications",
        approvalLevel: "L1",
        objective:
          "You are the S.O.S. sales-coaching WhatsApp assistant. Draft a warm, concise reply " +
          "in the sender's language (usually Hebrew). You may answer operational questions " +
          "(courses, schedules, how the program works, general guidance). Mark sensitive=true " +
          "for anything about pricing, discounts, refunds, complaints, personal coaching decisions, " +
          "or commitments on behalf of S.O.S. " +
          'Return STRICT JSON only: {"reply":"...","sensitive":true|false}.',
        context: `CONVERSATION SO FAR (sender ${msg.from}):\n${historyText}\n\nLATEST MESSAGE:\n${msg.text}`,
        budgetTokens: 800,
      },
      traceId,
    );

    const raw = ((result.output as { text?: string })?.text ?? "").trim();
    let reply: string | null = null;
    let sensitive = true; // safe default: unparseable output goes to a human
    try {
      const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as {
        reply?: string;
        sensitive?: boolean;
      };
      if (parsed.reply) {
        reply = parsed.reply;
        sensitive = parsed.sensitive !== false;
      }
    } catch {
      // keep safe default
    }
    if (!reply) return this.parkReply(orgId, msg.from, raw || "(no draft)", "unparseable_draft", traceId);
    if (sensitive) return this.parkReply(orgId, msg.from, reply, "sensitive", traceId);

    // DNA gate — only when brand rules exist; skipping is audited.
    try {
      const rules = await this.dna.listRules(orgId);
      if (rules.length > 0) {
        const evaluation = await this.dna.evaluate(orgId, "whatsapp_bot", reply, traceId);
        if (evaluation.verdict !== "pass") {
          return this.parkReply(orgId, msg.from, reply, `dna_${evaluation.verdict}`, traceId);
        }
      }
    } catch {
      return this.parkReply(orgId, msg.from, reply, "dna_error", traceId);
    }

    try {
      const sent = await this.executeSend(orgId, msg.from, reply, traceId);
      await writeAudit({
        orgId,
        actorType: "agent",
        actorId: "whatsapp_bot",
        action: "whatsapp.auto_replied",
        subjectType: "webhook_event",
        subjectId: msg.providerEventId,
        traceId,
        payload: { to: msg.from },
      });
      return { autoReplied: true, ...sent };
    } catch {
      return this.parkReply(orgId, msg.from, reply, "send_failed", traceId);
    }
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
