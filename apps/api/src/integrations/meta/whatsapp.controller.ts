import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { getDb, writeAudit } from "@salesos/db";
import type { ApiRequest } from "../../common/request.js";
import { JwtAuthGuard, CurrentUser } from "../../auth/jwt.guard.js";
import { TenantGuard } from "../../auth/tenant.guard.js";
import { Roles, RolesGuard } from "../../auth/roles.guard.js";
import type { JwtClaims } from "../../auth/auth.service.js";
import { WhatsAppService } from "./whatsapp.service.js";

@Controller("orgs/:orgId/integrations/whatsapp")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class WhatsAppController {
  constructor(private readonly whatsapp: WhatsAppService) {}

  @Get("messages")
  @Roles("owner", "manager", "coach")
  messages(@Param("orgId") orgId: string, @Query("limit") limit?: string) {
    return this.whatsapp.listMessages(orgId, limit ? Number(limit) : undefined);
  }

  /** Outbound sends are external actions (L3): always parked for approval. */
  @Post("send")
  @Roles("owner", "manager")
  async send(
    @Param("orgId") orgId: string,
    @CurrentUser() user: JwtClaims,
    @Body() body: { to?: string; text?: string },
    @Req() req: ApiRequest,
  ) {
    if (!body?.to || !body?.text) throw new BadRequestException("to and text are required");
    const approval = await getDb().approval.create({
      data: {
        orgId,
        subjectType: "whatsapp_message",
        subjectId: body.to,
        requestedBy: user.sub,
        status: "pending",
        payloadJson: { title: `WhatsApp → ${body.to}`, to: body.to, text: body.text },
      },
    });
    await writeAudit({
      orgId,
      actorType: "user",
      actorId: user.sub,
      action: "whatsapp.send_requested",
      subjectType: "approval",
      subjectId: approval.id,
      traceId: req.traceId,
      payload: { to: body.to },
    });
    return { approvalId: approval.id, status: "awaiting_approval" };
  }
}
