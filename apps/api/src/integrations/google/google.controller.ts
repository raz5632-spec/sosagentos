import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { ApiRequest } from "../../common/request.js";
import { JwtAuthGuard, CurrentUser } from "../../auth/jwt.guard.js";
import { TenantGuard } from "../../auth/tenant.guard.js";
import { Roles, RolesGuard } from "../../auth/roles.guard.js";
import type { JwtClaims } from "../../auth/auth.service.js";
import { GoogleService } from "./google.service.js";

@Controller("integrations/google")
export class GoogleCallbackController {
  constructor(private readonly google: GoogleService) {}

  @Get("callback")
  async callback(@Query("code") code: string, @Query("state") state: string, @Res() res: Response) {
    try {
      await this.google.handleCallback(code, state);
      res.redirect("https://app.secretofsaleschat.org/dashboard?google=connected");
    } catch {
      res.redirect("https://app.secretofsaleschat.org/dashboard?google=error");
    }
  }
}

@Controller("orgs/:orgId/integrations/google")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class GoogleController {
  constructor(private readonly google: GoogleService) {}

  @Get("status")
  @Roles("owner", "manager")
  status(@Param("orgId") orgId: string) {
    return this.google.status(orgId);
  }

  @Get("connect")
  @Roles("owner", "manager")
  connect(@Param("orgId") orgId: string) {
    return this.google.authorizeUrl(orgId);
  }

  @Post("import/gmail")
  @Roles("owner", "manager")
  importGmail(
    @Param("orgId") orgId: string,
    @CurrentUser() user: JwtClaims,
    @Body() body: { maxItems?: number },
    @Req() req: ApiRequest,
  ) {
    return this.google.importGmail(orgId, user.sub, body?.maxItems ?? 10, req.traceId);
  }
}
