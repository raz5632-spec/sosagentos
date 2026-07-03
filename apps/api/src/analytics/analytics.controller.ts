import { Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { ApiRequest } from "../common/request.js";
import { JwtAuthGuard, CurrentUser } from "../auth/jwt.guard.js";
import { TenantGuard } from "../auth/tenant.guard.js";
import { Roles, RolesGuard } from "../auth/roles.guard.js";
import type { JwtClaims } from "../auth/auth.service.js";
import { AnalyticsService } from "./analytics.service.js";

@Controller("orgs/:orgId")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get("dashboard")
  @Roles("owner", "manager")
  dashboard(@Param("orgId") orgId: string) {
    return this.analytics.dashboard(orgId);
  }

  @Post("analytics/snapshot")
  @Roles("owner", "manager")
  snapshot(
    @Param("orgId") orgId: string,
    @CurrentUser() user: JwtClaims,
    @Req() req: ApiRequest,
  ) {
    return this.analytics.snapshot(orgId, user.sub, req.traceId);
  }
}
