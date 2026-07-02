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
import { DnaService } from "./dna.service.js";

@Controller("orgs/:orgId/dna")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class DnaController {
  constructor(private readonly dna: DnaService) {}

  @Get("rules")
  @Roles("owner", "manager", "coach")
  list(@Param("orgId") orgId: string, @Query("all") all?: string) {
    return this.dna.listRules(orgId, all === "true");
  }

  @Post("rules")
  @Roles("owner", "manager")
  create(
    @Param("orgId") orgId: string,
    @CurrentUser() user: JwtClaims,
    @Body() body: { ruleType?: string; ruleText?: string; severity?: string },
    @Req() req: ApiRequest,
  ) {
    if (!body?.ruleType || !body?.ruleText) {
      throw new BadRequestException("ruleType and ruleText are required");
    }
    return this.dna.createRule(
      orgId,
      user.sub,
      { ruleType: body.ruleType, ruleText: body.ruleText, severity: body.severity },
      req.traceId,
    );
  }

  @Post("rules/:ruleId/deactivate")
  @Roles("owner", "manager")
  deactivate(
    @Param("orgId") orgId: string,
    @Param("ruleId") ruleId: string,
    @CurrentUser() user: JwtClaims,
    @Req() req: ApiRequest,
  ) {
    return this.dna.deactivateRule(orgId, ruleId, user.sub, req.traceId);
  }

  @Post("evaluate")
  @Roles("owner", "manager", "coach")
  evaluate(
    @Param("orgId") orgId: string,
    @CurrentUser() user: JwtClaims,
    @Body() body: { content?: string },
    @Req() req: ApiRequest,
  ) {
    if (!body?.content?.trim()) throw new BadRequestException("content is required");
    return this.dna.evaluate(orgId, user.sub, body.content, req.traceId);
  }
}
