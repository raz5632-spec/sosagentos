import { Controller, Get, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { ApiRequest } from "../../common/request.js";
import { JwtAuthGuard, CurrentUser } from "../../auth/jwt.guard.js";
import { TenantGuard } from "../../auth/tenant.guard.js";
import { Roles, RolesGuard } from "../../auth/roles.guard.js";
import type { JwtClaims } from "../../auth/auth.service.js";
import { CanvaService } from "./canva.service.js";

// Public callback (Canva redirects the browser here, no JWT).
@Controller("integrations/canva")
export class CanvaCallbackController {
  constructor(private readonly canva: CanvaService) {}

  @Get("callback")
  async callback(@Query("code") code: string, @Query("state") state: string, @Res() res: Response) {
    try {
      await this.canva.handleCallback(code, state);
      res.redirect("https://app.secretofsaleschat.org/dashboard?canva=connected");
    } catch {
      res.redirect("https://app.secretofsaleschat.org/dashboard?canva=error");
    }
  }
}

// Authenticated console endpoints.
@Controller("orgs/:orgId/integrations/canva")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class CanvaController {
  constructor(private readonly canva: CanvaService) {}

  @Get("status")
  @Roles("owner", "manager")
  status(@Param("orgId") orgId: string) {
    return this.canva.status(orgId);
  }

  @Get("connect")
  @Roles("owner", "manager")
  connect(@Param("orgId") orgId: string) {
    return this.canva.authorizeUrl(orgId);
  }

  @Post("designs/:contentAssetId")
  @Roles("owner", "manager")
  design(
    @Param("orgId") orgId: string,
    @Param("contentAssetId") contentAssetId: string,
    @CurrentUser() _user: JwtClaims,
    @Req() req: ApiRequest,
  ) {
    return this.canva.designFromContent(orgId, contentAssetId, req.traceId);
  }
}
