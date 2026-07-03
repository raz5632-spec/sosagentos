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
import type { ApiRequest } from "../common/request.js";
import { JwtAuthGuard, CurrentUser } from "../auth/jwt.guard.js";
import { TenantGuard } from "../auth/tenant.guard.js";
import { Roles, RolesGuard } from "../auth/roles.guard.js";
import type { JwtClaims } from "../auth/auth.service.js";
import { ContentService } from "./content.service.js";

@Controller("orgs/:orgId/content")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get()
  @Roles("owner", "manager", "coach")
  list(@Param("orgId") orgId: string, @Query("status") status?: string) {
    return this.content.list(orgId, status);
  }

  @Get(":id")
  @Roles("owner", "manager", "coach")
  get(@Param("orgId") orgId: string, @Param("id") id: string) {
    return this.content.get(orgId, id);
  }

  @Post("briefs")
  @Roles("owner", "manager")
  createBrief(
    @Param("orgId") orgId: string,
    @CurrentUser() user: JwtClaims,
    @Body() body: { title?: string; type?: string; targetChannel?: string; brief?: string },
    @Req() req: ApiRequest,
  ) {
    if (!body?.title || !body?.brief) {
      throw new BadRequestException("title and brief are required");
    }
    return this.content.createBrief(
      orgId,
      user.sub,
      { title: body.title, type: body.type, targetChannel: body.targetChannel, brief: body.brief },
      req.traceId,
    );
  }

  @Post(":id/draft")
  @Roles("owner", "manager")
  draft(
    @Param("orgId") orgId: string,
    @Param("id") id: string,
    @CurrentUser() user: JwtClaims,
    @Req() req: ApiRequest,
  ) {
    return this.content.draft(orgId, id, user.sub, req.traceId);
  }

  @Post(":id/submit")
  @Roles("owner", "manager")
  submit(
    @Param("orgId") orgId: string,
    @Param("id") id: string,
    @CurrentUser() user: JwtClaims,
    @Req() req: ApiRequest,
  ) {
    return this.content.submit(orgId, id, user.sub, req.traceId);
  }
}
