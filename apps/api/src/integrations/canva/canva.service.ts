import { BadRequestException, Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { getDb, writeAudit } from "@salesos/db";

// Canva Connect: OAuth 2.0 Authorization Code + PKCE (SHA-256), tokens ~4h, per-user scopes.
// docs/05-integrations/canva.md
const AUTH_URL = "https://www.canva.com/api/oauth/authorize";
const TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";
const API = "https://api.canva.com/rest/v1";
const SCOPES = "design:content:read design:content:write asset:read asset:write";

@Injectable()
export class CanvaService {
  private pkce = new Map<string, { verifier: string; orgId: string }>();

  private cfg() {
    const clientId = process.env.CANVA_CLIENT_ID;
    const clientSecret = process.env.CANVA_CLIENT_SECRET;
    const redirect = process.env.CANVA_REDIRECT ?? "https://api.secretofsaleschat.org/integrations/canva/callback";
    if (!clientId || !clientSecret) throw new BadRequestException("Canva credentials not configured");
    return { clientId, clientSecret, redirect };
  }

  /** Build the authorization URL (PKCE) the CEO opens to grant access. */
  authorizeUrl(orgId: string) {
    const { clientId, redirect } = this.cfg();
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const state = randomBytes(16).toString("hex");
    this.pkce.set(state, { verifier, orgId });
    const url =
      `${AUTH_URL}?response_type=code&client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent(SCOPES)}` +
      `&code_challenge=${challenge}&code_challenge_method=S256&state=${state}`;
    return { url, state };
  }

  /** Exchange the callback code for tokens and persist them. */
  async handleCallback(code: string, state: string) {
    const entry = this.pkce.get(state);
    if (!entry) throw new BadRequestException("unknown or expired state");
    this.pkce.delete(state);
    const { clientId, clientSecret, redirect } = this.cfg();

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: entry.verifier,
        redirect_uri: redirect,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!res.ok || !body.access_token) {
      throw new BadRequestException(`Canva token exchange failed: HTTP ${res.status}`);
    }
    await this.storeTokens(entry.orgId, body.access_token, body.refresh_token, body.expires_in);
    await writeAudit({
      orgId: entry.orgId,
      actorType: "user",
      actorId: "ceo",
      action: "canva.connected",
      subjectType: "integration_connection",
      subjectId: "canva",
    });
    return { connected: true };
  }

  private async storeTokens(orgId: string, access: string, refresh?: string, expiresIn?: number) {
    const db = getDb();
    const conn = await db.integrationConnection.upsert({
      where: { orgId_provider: { orgId, provider: "canva" } },
      update: { status: "connected" },
      create: { orgId, provider: "canva", status: "connected", scopesJson: SCOPES.split(" ") },
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
        data: { integrationConnectionId: conn.id, tokenRef: access, refreshRef: refresh, expiresAt, subject: "canva" },
      });
    }
  }

  /**
   * Export a design to a PNG and return the file URL. Canva exports are async:
   * create job → poll until success. Returns null if not connected or on error.
   */
  async exportDesignImage(orgId: string, designId: string): Promise<string | null> {
    const token = await this.accessToken(orgId);
    if (!token) return null;
    const createRes = await fetch(`${API}/exports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ design_id: designId, format: { type: "png" } }),
    });
    const created = (await createRes.json().catch(() => ({}))) as { job?: { id?: string } };
    const jobId = created.job?.id;
    if (!createRes.ok || !jobId) return null;

    // Poll the export job (usually ready within a few seconds).
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const jobRes = await fetch(`${API}/exports/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const job = (await jobRes.json().catch(() => ({}))) as {
        job?: { status?: string; urls?: string[] };
      };
      const status = job.job?.status;
      if (status === "success") return job.job?.urls?.[0] ?? null;
      if (status === "failed") return null;
    }
    return null;
  }

  /** Valid access token, refreshing if expired. Returns null if not connected. */
  private async accessToken(orgId: string): Promise<string | null> {
    const db = getDb();
    const conn = await db.integrationConnection.findUnique({
      where: { orgId_provider: { orgId, provider: "canva" } },
    });
    if (!conn) return null;
    const cred = await db.oAuthCredential.findFirst({ where: { integrationConnectionId: conn.id } });
    if (!cred) return null;
    if (cred.expiresAt && cred.expiresAt.getTime() > Date.now() + 60_000) return cred.tokenRef;
    if (!cred.refreshRef) return cred.tokenRef; // best effort

    const { clientId, clientSecret } = this.cfg();
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: cred.refreshRef }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!res.ok || !body.access_token) return cred.tokenRef;
    await this.storeTokens(orgId, body.access_token, body.refresh_token ?? cred.refreshRef, body.expires_in);
    return body.access_token;
  }

  async status(orgId: string) {
    const token = await this.accessToken(orgId).catch(() => null);
    return { connected: !!token };
  }

  /**
   * Create a Canva design seeded with the asset's draft text and return its
   * edit URL. Rendering to final art still happens in Canva; this hands off
   * a ready starting point. Returns { connected: false } when not linked yet.
   */
  async designFromContent(orgId: string, contentAssetId: string, traceId?: string) {
    const token = await this.accessToken(orgId);
    if (!token) return { connected: false as const };

    const asset = await getDb().contentAsset.findFirst({
      where: { id: contentAssetId, orgId },
      include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } },
    });
    if (!asset) throw new BadRequestException("content asset not found");
    const body = asset.versions[0]?.bodyJson as { text?: string } | undefined;
    const title = asset.title.slice(0, 50);

    // Canva presets are limited (doc/whiteboard/presentation); an Instagram
    // square post is a custom 1080x1080 design.
    const res = await fetch(`${API}/designs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ design_type: { type: "custom", width: 1080, height: 1080 }, title }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      design?: { id?: string; urls?: { edit_url?: string; view_url?: string } };
    };
    if (!res.ok || !data.design?.id) {
      throw new BadRequestException(`Canva design create failed: HTTP ${res.status}`);
    }

    const db = getDb();
    await db.designBrief.upsert({
      where: { contentAssetId },
      update: { canvaTemplateId: data.design.id },
      create: {
        contentAssetId,
        canvaTemplateId: data.design.id,
        format: "instagram_post",
        constraintsJson: { draftText: body?.text ?? null } as object,
      },
    });
    await writeAudit({
      orgId,
      actorType: "agent",
      actorId: "design_brief",
      action: "canva.design_created",
      subjectType: "content_asset",
      subjectId: contentAssetId,
      traceId,
      payload: { designId: data.design.id },
    });
    return {
      connected: true as const,
      designId: data.design.id,
      editUrl: data.design.urls?.edit_url,
      viewUrl: data.design.urls?.view_url,
    };
  }
}
