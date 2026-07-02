import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { ApiRequest } from "../common/request.js";
import { JwtAuthGuard, CurrentUser } from "../auth/jwt.guard.js";
import { TenantGuard } from "../auth/tenant.guard.js";
import { Roles, RolesGuard } from "../auth/roles.guard.js";
import type { JwtClaims } from "../auth/auth.service.js";
import { ApprovalsService } from "./approvals.service.js";

@Controller("orgs/:orgId/approvals")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  @Roles("owner", "manager")
  list(@Param("orgId") orgId: string, @Query("status") status?: string) {
    return this.approvals.list(orgId, status ?? "pending");
  }

  @Post(":approvalId/approve")
  @Roles("owner", "manager")
  approve(
    @Param("orgId") orgId: string,
    @Param("approvalId") approvalId: string,
    @CurrentUser() user: JwtClaims,
    @Req() req: ApiRequest,
  ) {
    return this.approvals.approve(orgId, approvalId, user.sub, req.traceId);
  }

  @Post(":approvalId/reject")
  @Roles("owner", "manager")
  reject(
    @Param("orgId") orgId: string,
    @Param("approvalId") approvalId: string,
    @CurrentUser() user: JwtClaims,
    @Body() body: { reason?: string },
    @Req() req: ApiRequest,
  ) {
    return this.approvals.reject(orgId, approvalId, user.sub, body?.reason, req.traceId);
  }
}
