import { BadRequestException, Injectable } from "@nestjs/common";
import { getDb, writeAudit } from "@salesos/db";
import { AgentsService } from "../../agents/agents.service.js";
import { DnaService } from "../../dna/dna.service.js";
import { KnowledgeService } from "../../knowledge/knowledge.service.js";
import { AnalyticsService } from "../../analytics/analytics.service.js";
import { ContentService } from "../../content/content.service.js";
import { CanvaService } from "../canva/canva.service.js";
import { renderSlide, parseSlides } from "../../content/slides.js";

const GRAPH_URL = "https://graph.facebook.com/v21.0";

// Shared persona for every WhatsApp reply — sound like a sharp, human Israeli
// sales advisor, not a robot. Natural spoken Hebrew, warm but direct.
const VOICE =
  "כתוב בעברית טבעית וזורמת כמו בן אדם אמיתי שמדבר בוואטסאפ — משפטים קצרים, חמים אבל ישירים " +
  "וחכמים, בגובה העיניים. בלי שפה רובוטית, בלי 'כמובן' ו'בשמחה' סתמיים, בלי לחזור על השאלה. " +
  "תיכנס לעניין, תהיה מדויק, ותשתמש בידע של S.O.S. כשהוא רלוונטי. לעולם לא לענות באנגלית. ";

// Autonomy policy (CEO decision 2026-07-05, "option A"): the bot replies
// autonomously to operational questions; sensitive topics (pricing, complaints,
// refunds, commitments) and DNA failures are parked in the approvals inbox.

export interface NormalizedWhatsAppMessage {
  providerEventId: string;
  from: string;
  timestamp: string;
  type: string;
  text: string | null;
  mediaId?: string | null;
  mediaType?: string | null;
}

@Injectable()
export class WhatsAppService {
  constructor(
    private readonly agents: AgentsService,
    private readonly dna: DnaService,
    private readonly knowledge: KnowledgeService,
    private readonly analytics: AnalyticsService,
    private readonly content: ContentService,
    private readonly canva: CanvaService,
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
              image?: { id?: string; caption?: string; mime_type?: string };
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
            text: msg.text?.body ?? msg.image?.caption ?? null,
            mediaId: msg.image?.id ?? null,
            mediaType: msg.image?.mime_type ?? null,
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

    // Conversational bot: reply to each newly-stored message.
    if (stored > 0) {
      for (const msg of messages) {
        try {
          if (msg.type === "image" && msg.mediaId) {
            await this.imageReply(orgId, msg, traceId);
          } else if (msg.text) {
            await this.autoReply(orgId, msg, traceId);
          } else if (msg.type && msg.type !== "text") {
            // Audio/video/document still need a dedicated pipeline (voice→STT).
            const note =
              msg.type === "audio"
                ? "קיבלתי הודעה קולית 🎙️ — עדיין לא מחובר לתמלול קולי. אפשר לכתוב לי בבקשה?"
                : "קיבלתי את הקובץ — כרגע אני מבין טקסט ותמונות. אפשר לכתוב לי או לשלוח תמונה?";
            await this.executeSend(orgId, msg.from, note, traceId).catch(() => undefined);
          }
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
   * CEO channel: classify the message as chat / content command / report, then
   * either answer directly (KPI-grounded, ungated) or run a work command
   * (e.g. produce a content draft) and report back. Publications stay gated.
   */
  private async ceoTurn(
    orgId: string,
    msg: NormalizedWhatsAppMessage,
    historyText: string,
    kpiBlock: string,
    knowledgeBlock: string,
    traceId?: string,
  ) {
    // A weekly/competitor report request gets the full dashboard digest as context.
    let reportBlock = "";
    if (/דוח|דו"ח|שבוע|סיכום|מה הלך|report|מתחר/i.test(msg.text ?? "")) {
      try {
        const dash = await this.analytics.dashboard(orgId);
        reportBlock = `\n\nFULL DASHBOARD DIGEST:\n${JSON.stringify({
          kpis: dash.kpis,
          pendingApprovals: dash.pendingApprovals.length,
          recentAi: dash.recentAiActivity.slice(0, 5),
        })}`;
      } catch {
        /* optional */
      }
    }

    const result = await this.agents.invoke(
      orgId,
      "whatsapp_bot",
      {
        agentCode: "ceo_interface",
        approvalLevel: "L1",
        objective:
          VOICE +
          "You are the personal executive assistant of Raz, CEO of S.O.S. sales coaching — this " +
          "message is from Raz himself. ALWAYS reply in Hebrew only — never in English, not a single " +
          "word, even for technical terms (use Hebrew or transliteration). Classify his intent. Intents: " +
          '"chat" (a quick question/status — answer directly using the live KPIs); ' +
          '"report" (he wants a weekly/competitor/summary report — write a clear, structured ' +
          "digest from the DASHBOARD DIGEST: students & at-risk, approvals pending, content pipeline, " +
          "knowledge, AI cost, and what stands out; be honest that competitor/social data is limited " +
          'until those pipelines have data); ' +
          '"content" (he wants a post/carousel/story/script produced — extract a short topic); ' +
          '"teach" (he is teaching you something to remember — a sales-conversation map, a principle, ' +
          "a fact about S.O.S., how to answer something. Extract a clear title and the full lesson " +
          "content so it can be saved to permanent memory). " +
          "Never invent capabilities: Canva rendering and Instagram posting are not connected yet, " +
          "so for content say the text draft will be prepared and returned for approval. " +
          'Return STRICT JSON only, all text in Hebrew: {"intent":"chat|report|content|teach",' +
          '"topic":"<if content: short topic>","title":"<if teach: short title>",' +
          '"lesson":"<if teach: the full material to remember>","reply":"<hebrew message to send now>"}.',
        context: `CONVERSATION SO FAR:\n${historyText}\n\nLATEST MESSAGE:\n${msg.text}${kpiBlock}${reportBlock}${knowledgeBlock}`,
        budgetTokens: 2000,
      },
      traceId,
    );
    const raw = ((result.output as { text?: string })?.text ?? "").trim();
    let intent = "chat";
    let topic = "";
    let teachTitle = "";
    let teachLesson = "";
    let reply = raw;
    try {
      const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as {
        intent?: string;
        topic?: string;
        title?: string;
        lesson?: string;
        reply?: string;
      };
      if (parsed.reply) reply = parsed.reply;
      if (parsed.intent) intent = parsed.intent;
      if (parsed.topic) topic = parsed.topic;
      if (parsed.title) teachTitle = parsed.title;
      if (parsed.lesson) teachLesson = parsed.lesson;
    } catch {
      /* fall back to raw as chat */
    }

    // Teach command → save straight to permanent memory (CEO is authoritative).
    if (intent === "teach" && teachLesson) {
      try {
        const item = await this.knowledge.capture(
          orgId,
          "ceo_whatsapp",
          {
            title: (teachTitle || teachLesson.slice(0, 60)).slice(0, 120),
            type: "ceo_lesson",
            sourceType: "whatsapp_teaching",
            content: teachLesson,
          },
          traceId,
        );
        await this.knowledge.promote(orgId, item.id, "ceo_whatsapp", traceId);
        reply =
          reply ||
          `קיבלתי ולמדתי 💡 שמרתי את זה בזיכרון הקבוע ("${teachTitle || "שיעור חדש"}") — מעכשיו אתבסס על זה בתשובות שלי.`;
      } catch (err) {
        reply = `רציתי לשמור את זה בזיכרון אבל נתקלתי בבעיה: ${String(err)}.`;
      }
    }

    // Content command → run the content engine (brief → copy draft + DNA QA).
    if (intent === "content" && topic) {
      try {
        const brief = await this.content.createBrief(
          orgId,
          "whatsapp_bot",
          {
            title: `WhatsApp: ${topic}`.slice(0, 120),
            type: "carousel",
            targetChannel: "instagram",
            brief: `CEO requested via WhatsApp: ${msg.text}. Topic: ${topic}.`,
          },
          traceId,
        );
        const draft = await this.content.draft(orgId, brief.id, "whatsapp_bot", traceId);
        const preview = (draft.draft ?? "").slice(0, 800);

        // Render the carousel as real branded slide images and send them.
        let slidesSent = 0;
        try {
          slidesSent = await this.sendCarouselSlides(orgId, msg.from, draft.draft ?? "", topic, traceId);
        } catch {
          /* image sending is best-effort; the text draft is still delivered */
        }

        // Also create a Canva design for further editing (link only).
        let canvaLine = "";
        try {
          const design = await this.canva.designFromContent(orgId, brief.id, traceId);
          if (design.connected && design.editUrl) {
            canvaLine = `לעריכה/מיתוג נוסף ב-Canva:\n${design.editUrl}\n`;
          }
        } catch {
          /* optional */
        }

        reply = slidesSent
          ? `הנה הקרוסלה על "${topic}" — ${slidesSent} שקפים מעוצבים 👆\n\n${canvaLine}אפשר לאשר/לתקן בקונסולה.`
          : `הכנתי טיוטת תוכן על "${topic}" ✍️\n\n${preview}\n\n${canvaLine}נשמרה בצנרת התוכן (בדיקת מותג: ${draft.qaStatus}). אפשר לאשר/לתקן בקונסולה.`;
      } catch (err) {
        reply = `רציתי להכין את התוכן אבל נתקלתי בבעיה: ${String(err)}. אפשר לנסות שוב או להכין בקונסולה.`;
      }
    }

    const text = reply || "(אין תשובה)";
    try {
      return await this.executeSend(orgId, msg.from, text, traceId);
    } catch {
      // If sending isn't configured, don't lose the work — park it.
      return this.parkReply(orgId, msg.from, text, "send_failed", traceId);
    }
  }

  /**
   * Option-A autonomy: draft a reply via the communications agent; auto-send
   * unless the agent flags it sensitive, DNA fails it, or the send fails.
   */
  async autoReply(orgId: string, msg: NormalizedWhatsAppMessage, traceId?: string) {
    const { endpoint } = await this.ensureConnection(orgId);
    const history = await this.history(endpoint.id, msg.from);
    const historyText = history.map((h) => `- ${h.text}`).join("\n");
    const isCeo = !!process.env.CEO_WHATSAPP_NUMBER && msg.from === process.env.CEO_WHATSAPP_NUMBER;

    // Ground replies in approved knowledge (RAG over production items).
    let knowledgeBlock = "";
    try {
      const hits = await this.knowledge.search(orgId, msg.text ?? "", { status: "production", limit: 3 });
      if (hits.length) {
        knowledgeBlock =
          "\n\nAPPROVED S.O.S. KNOWLEDGE (base your answer on this when relevant):\n" +
          hits.map((h) => `[${h.title}] ${h.snippet}`).join("\n");
      }
    } catch {
      // knowledge is an enhancement, never a blocker
    }

    let kpiBlock = "";
    if (isCeo) {
      try {
        const kpis = await this.analytics.computeKpis(orgId);
        kpiBlock = `\n\nLIVE PLATFORM KPIS: ${JSON.stringify(kpis)}`;
      } catch {
        /* optional context */
      }
    }

    if (isCeo) {
      return this.ceoTurn(orgId, msg, historyText, kpiBlock, knowledgeBlock, traceId);
    }

    const objective =
      VOICE +
      "You are the S.O.S. sales-coaching WhatsApp assistant. ALWAYS reply in Hebrew only — never " +
        "English. Draft a warm, concise reply. You may answer operational questions " +
        "(courses, schedules, how the program works, general guidance). Mark sensitive=true " +
        "for anything about pricing, discounts, refunds, complaints, personal coaching decisions, " +
        "or commitments on behalf of S.O.S. " +
        'Return STRICT JSON only: {"reply":"...","sensitive":true|false}.';

    const result = await this.agents.invoke(
      orgId,
      "whatsapp_bot",
      {
        agentCode: "communications",
        approvalLevel: "L1",
        objective,
        context: `CONVERSATION SO FAR (sender ${msg.from}):\n${historyText}\n\nLATEST MESSAGE:\n${msg.text}${knowledgeBlock}${kpiBlock}`,
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

  /** Download WhatsApp media (image) and return it base64-encoded for vision. */
  private async downloadMedia(mediaId: string): Promise<{ base64: string; mediaType: string } | null> {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) return null;
    const metaRes = await fetch(`${GRAPH_URL}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meta = (await metaRes.json().catch(() => ({}))) as { url?: string; mime_type?: string };
    if (!metaRes.ok || !meta.url) return null;
    const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!binRes.ok) return null;
    const buf = Buffer.from(await binRes.arrayBuffer());
    return { base64: buf.toString("base64"), mediaType: meta.mime_type ?? "image/jpeg" };
  }

  /** Vision: download the image and let Claude describe/act on it, then reply. */
  async imageReply(orgId: string, msg: NormalizedWhatsAppMessage, traceId?: string) {
    const media = await this.downloadMedia(msg.mediaId!);
    if (!media) {
      await this.executeSend(orgId, msg.from, "קיבלתי תמונה 📷 אבל לא הצלחתי להוריד אותה. אפשר לנסות שוב?", traceId).catch(() => undefined);
      return;
    }
    const isCeo = !!process.env.CEO_WHATSAPP_NUMBER && msg.from === process.env.CEO_WHATSAPP_NUMBER;
    const caption = msg.text ? `כיתוב שצורף: "${msg.text}".` : "";
    const result = await this.agents.invoke(
      orgId,
      "whatsapp_bot",
      {
        agentCode: isCeo ? "ceo_interface" : "communications",
        approvalLevel: "L1",
        objective:
          "אתה עוזר של S.O.S. לאימון מכירות ומקבל תמונה בוואטסאפ. תסתכל על התמונה ותגיב בעברית " +
          "בלבד, בצורה טבעית וחדה כמו יועץ אנושי. אם זו סקיצה/עיצוב/צילום מסך של תוכן — תן משוב " +
          "ענייני. אם זה משהו אחר — תגיד מה אתה רואה ואיך זה קשור. " +
          caption +
          " תחזיר טקסט בלבד (לא JSON), עברית בלבד.",
        context: msg.text ?? "",
        images: [{ mediaType: media.mediaType, base64: media.base64 }],
        budgetTokens: 1500,
      },
      traceId,
    );
    const reply = ((result.output as { text?: string })?.text ?? "ראיתי את התמונה, אבל לא הצלחתי לנסח תגובה. אפשר לתאר לי מה חשוב לך בה?").trim();
    await this.executeSend(orgId, msg.from, reply, traceId).catch(async () => {
      await this.parkReply(orgId, msg.from, reply, "send_failed", traceId);
    });
    await writeAudit({
      orgId,
      actorType: "agent",
      actorId: "whatsapp_bot",
      action: "whatsapp.image_analyzed",
      subjectType: "webhook_event",
      subjectId: msg.providerEventId,
      traceId,
    });
  }

  /** Upload an image buffer to WhatsApp media, returning a media id. */
  async uploadMedia(pngBuffer: Buffer): Promise<string | null> {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) return null;
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", "image/png");
    form.append("file", new Blob([new Uint8Array(pngBuffer)], { type: "image/png" }), "slide.png");
    const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return res.ok ? (body.id ?? null) : null;
  }

  /** Send a previously-uploaded image by media id. */
  async sendImageById(orgId: string, to: string, mediaId: string, caption?: string, traceId?: string) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) return { sent: false as const };
    const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: { id: mediaId, ...(caption ? { caption } : {}) },
      }),
    });
    await writeAudit({
      orgId,
      actorType: "system",
      actorId: "whatsapp_sender",
      action: res.ok ? "whatsapp.image_sent" : "whatsapp.image_send_failed",
      subjectType: "integration_connection",
      subjectId: "meta_whatsapp",
      traceId,
      payload: { to },
    });
    return { sent: res.ok };
  }

  /** Render carousel slides from a draft and send them as real images. */
  async sendCarouselSlides(orgId: string, to: string, draft: string, topic: string, traceId?: string): Promise<number> {
    const slides = parseSlides(draft);
    if (slides.length === 0) return 0;
    let sent = 0;
    for (let i = 0; i < slides.length; i++) {
      const png = renderSlide(slides[i], i + 1, slides.length);
      const mediaId = await this.uploadMedia(png);
      if (!mediaId) continue;
      const res = await this.sendImageById(
        orgId,
        to,
        mediaId,
        i === 0 ? `קרוסלה על "${topic}" — טיוטה לאישור` : undefined,
        traceId,
      );
      if (res.sent) sent++;
    }
    return sent;
  }

  /** Send an image message (by public URL) via the Graph API. */
  async sendImage(orgId: string, to: string, imageUrl: string, caption?: string, traceId?: string) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) return { sent: false as const };
    const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: { link: imageUrl, ...(caption ? { caption } : {}) },
      }),
    });
    const ok = res.ok;
    await writeAudit({
      orgId,
      actorType: "system",
      actorId: "whatsapp_sender",
      action: ok ? "whatsapp.image_sent" : "whatsapp.image_send_failed",
      subjectType: "integration_connection",
      subjectId: "meta_whatsapp",
      traceId,
      payload: { to },
    });
    return { sent: ok };
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
