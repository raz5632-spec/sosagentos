import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { ApiRequest } from "../common/request.js";
import { JwtAuthGuard, CurrentUser } from "../auth/jwt.guard.js";
import { TenantGuard } from "../auth/tenant.guard.js";
import { Roles, RolesGuard } from "../auth/roles.guard.js";
import type { JwtClaims } from "../auth/auth.service.js";
import { CompetitorsService } from "./competitors.service.js";

@Controller("orgs/:orgId/competitors")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class CompetitorsController {
  constructor(private readonly competitors: CompetitorsService) {}

  @Get()
  @Roles("owner", "manager", "coach")
  list(@Param("orgId") orgId: string) {
    return this.competitors.list(orgId);
  }

  @Post()
  @Roles("owner", "manager")
  create(
    @Param("orgId") orgId: string,
    @CurrentUser() user: JwtClaims,
    @Body() body: { name?: string; handle?: string; channels?: string[] },
    @Req() req: ApiRequest,
  ) {
    if (!body?.name) throw new BadRequestException("name is required");
    return this.competitors.create(
      orgId,
      user.sub,
      { name: body.name, handle: body.handle, channels: body.channels },
      req.traceId,
    );
  }

  @Get(":id/observations")
  @Roles("owner", "manager", "coach")
  observations(@Param("orgId") orgId: string, @Param("id") id: string) {
    return this.competitors.observations(orgId, id);
  }

  @Post(":id/observations")
  @Roles("owner", "manager", "coach")
  observe(
    @Param("orgId") orgId: string,
    @Param("id") id: string,
    @CurrentUser() user: JwtClaims,
    @Body() body: { summary?: string; url?: string; contentType?: string; signals?: Record<string, unknown> },
    @Req() req: ApiRequest,
  ) {
    if (!body?.summary?.trim()) throw new BadRequestException("summary is required");
    return this.competitors.addObservation(
      orgId,
      id,
      user.sub,
      { summary: body.summary, url: body.url, contentType: body.contentType, signals: body.signals },
      req.traceId,
    );
  }

  @Post(":id/analyze")
  @Roles("owner", "manager")
  analyze(
    @Param("orgId") orgId: string,
    @Param("id") id: string,
    @CurrentUser() user: JwtClaims,
    @Req() req: ApiRequest,
  ) {
    return this.competitors.analyze(orgId, id, user.sub, req.traceId);
  }
}
