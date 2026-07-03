import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { ApiRequest } from "../../common/request.js";
import { verifyMetaSignature } from "./signature.js";
import { WhatsAppService } from "./whatsapp.service.js";

// Public endpoints (no JWT): Meta calls these. Security = verify token + HMAC signature.
@Controller("webhooks/meta/whatsapp")
export class MetaWebhookController {
  constructor(private readonly whatsapp: WhatsAppService) {}

  /** Meta verification handshake. */
  @Get()
  async verify(
    @Query("hub.mode") mode?: string,
    @Query("hub.verify_token") token?: string,
    @Query("hub.challenge") challenge?: string,
  ) {
    const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (mode === "subscribe" && expected && token === expected && challenge) {
      await this.whatsapp.markVerified(await this.whatsapp.defaultOrgId());
      return challenge;
    }
    throw new ForbiddenException("webhook verification failed");
  }

  /** Event ingestion with signature validation and idempotent persistence. */
  @Post()
  async receive(@Req() req: RawBodyRequest<ApiRequest>) {
    const secret = process.env.META_APP_SECRET;
    if (!secret) throw new BadRequestException("META_APP_SECRET not configured");
    const signature = req.headers["x-hub-signature-256"] as string | undefined;
    if (!verifyMetaSignature(req.rawBody, signature, secret)) {
      throw new ForbiddenException("invalid signature");
    }
    return this.whatsapp.ingest(req.body, req.traceId);
  }
}
