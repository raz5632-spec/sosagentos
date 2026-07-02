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
import { OrgsService } from "./orgs.service.js";

@Controller("orgs/:orgId")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @Get("members")
  @Roles("owner", "manager")
  listMembers(@Param("orgId") orgId: string) {
    return this.orgs.listMembers(orgId);
  }

  @Post("members")
  @Roles("owner", "manager")
  addMember(
    @Param("orgId") orgId: string,
    @CurrentUser() user: JwtClaims,
    @Body() body: { email?: string; displayName?: string; roleCode?: string; password?: string },
    @Req() req: ApiRequest,
  ) {
    if (!body?.email || !body?.displayName || !body?.roleCode) {
      throw new BadRequestException("email, displayName and roleCode are required");
    }
    return this.orgs.addMember(
      orgId,
      user.sub,
      { email: body.email, displayName: body.displayName, roleCode: body.roleCode, password: body.password },
      req.traceId,
    );
  }
}
