import { BadRequestException, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { getDb, writeAudit } from "@salesos/db";
import { KnowledgeService } from "../../knowledge/knowledge.service.js";

// Google OAuth 2.0 (web server flow). Read-only acquisition into the knowledge base.
// docs/05-integrations/google.md
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "openid",
  "email",
];

@Injectable()
export class GoogleService {
  private states = new Map<string, string>(); // state -> orgId

  constructor(private readonly knowledge: KnowledgeService) {}

  private cfg() {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const redirect = process.env.GOOGLE_OAUTH_REDIRECT ?? "https://api.secretofsaleschat.org/integrations/google/callback";
    if (!clientId || !clientSecret) throw new BadRequestException("Google credentials not configured");
    return { clientId, clientSecret, redirect };
  }

  authorizeUrl(orgId: string) {
    const { clientId, redirect } = this.cfg();
    const state = randomBytes(16).toString("hex");
    this.states.set(state, orgId);
    const url =
      `${AUTH_URL}?response_type=code&client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent(SCOPES.join(" "))}` +
      `&access_type=offline&prompt=consent&state=${state}`;
    return { url, state };
  }

  async handleCallback(code: string, state: string) {
    const orgId = this.states.get(state);
    if (!orgId) throw new BadRequestException("unknown or expired state");
    this.states.delete(state);
    const { clientId, clientSecret, redirect } = this.cfg();

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirect,
        grant_type: "authorization_code",
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!res.ok || !body.access_token) {
      throw new BadRequestException(`Google token exchange failed: HTTP ${res.status}`);
    }
    await this.storeTokens(orgId, body.access_token, body.refresh_token, body.expires_in);
    await writeAudit({
      orgId,
      actorType: "user",
      actorId: "ceo",
      action: "google.connected",
      subjectType: "integration_connection",
      subjectId: "google",
    });
    return { connected: true };
  }

  private async storeTokens(orgId: string, access: string, refresh?: string, expiresIn?: number) {
    const db = getDb();
    const conn = await db.integrationConnection.upsert({
      where: { orgId_provider: { orgId, provider: "google" } },
      update: { status: "connected" },
      create: { orgId, provider: "google", status: "connected", scopesJson: SCOPES },
    });
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;
    const existing = await db.oAuthCredential.findFirst({ where: { integrationConnectionId: conn.id } });
    if (existing) {
      await db.oAuthCredential.update({
        where: { id: existing.id },
        data: { tokenRef: access, refreshRef: refresh ?? existing.refreshRef, expiresAt },
      });
    } else {
      await db.oAuthCredential.create({
        data: { integrationConnectionId: conn.id, tokenRef: access, refreshRef: refresh, expiresAt, subject: "google" },
      });
    }
  }

  private async accessToken(orgId: string): Promise<string | null> {
    const db = getDb();
    const conn = await db.integrationConnection.findUnique({
      where: { orgId_provider: { orgId, provider: "google" } },
    });
    if (!conn) return null;
    const cred = await db.oAuthCredential.findFirst({ where: { integrationConnectionId: conn.id } });
    if (!cred) return null;
    if (cred.expiresAt && cred.expiresAt.getTime() > Date.now() + 60_000) return cred.tokenRef;
    if (!cred.refreshRef) return cred.tokenRef;

    const { clientId, clientSecret } = this.cfg();
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: cred.refreshRef,
        grant_type: "refresh_token",
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    if (!res.ok || !body.access_token) return cred.tokenRef;
    await this.storeTokens(orgId, body.access_token, cred.refreshRef, body.expires_in);
    return body.access_token;
  }

  async status(orgId: string) {
    const token = await this.accessToken(orgId).catch(() => null);
    return { connected: !!token };
  }

  /**
   * Import recent Gmail messages as candidate knowledge items for the CEO to
   * review/promote. Read-only; only subject + snippet, never full bodies.
   */
  async importGmail(orgId: string, actorUserId: string, maxItems = 10, traceId?: string) {
    const token = await this.accessToken(orgId);
    if (!token) return { connected: false as const };

    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxItems}&q=newer_than:30d`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const list = (await listRes.json().catch(() => ({}))) as { messages?: Array<{ id: string }> };
    if (!listRes.ok) throw new BadRequestException(`Gmail list failed: HTTP ${listRes.status}`);

    let imported = 0;
    for (const m of list.messages ?? []) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const msg = (await msgRes.json().catch(() => ({}))) as {
        snippet?: string;
        payload?: { headers?: Array<{ name: string; value: string }> };
      };
      const subject = msg.payload?.headers?.find((h) => h.name === "Subject")?.value ?? "(no subject)";
      const from = msg.payload?.headers?.find((h) => h.name === "From")?.value ?? "";
      await this.knowledge.capture(
        orgId,
        actorUserId,
        {
          title: `Email: ${subject}`.slice(0, 120),
          type: "email",
          sourceType: "gmail",
          sourceRef: `gmail:${m.id}`,
          content: `From: ${from}\nSubject: ${subject}\n\n${msg.snippet ?? ""}`,
        },
        traceId,
      );
      imported++;
    }
    await writeAudit({
      orgId,
      actorType: "user",
      actorId: actorUserId,
      action: "gmail.imported",
      subjectType: "integration_connection",
      subjectId: "google",
      traceId,
      payload: { imported },
    });
    return { connected: true as const, imported };
  }
}
