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
import { SimulationsService } from "./simulations.service.js";

@Controller("orgs/:orgId/simulations")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class SimulationsController {
  constructor(private readonly simulations: SimulationsService) {}

  @Get()
  @Roles("owner", "manager")
  list(@Param("orgId") orgId: string) {
    return this.simulations.list(orgId);
  }

  @Get(":id")
  @Roles("owner", "manager")
  get(@Param("orgId") orgId: string, @Param("id") id: string) {
    return this.simulations.get(orgId, id);
  }

  @Post()
  @Roles("owner", "manager")
  run(
    @Param("orgId") orgId: string,
    @CurrentUser() user: JwtClaims,
    @Body() body: { question?: string; assumptions?: string[] },
    @Req() req: ApiRequest,
  ) {
    if (!body?.question) throw new BadRequestException("question is required");
    return this.simulations.run(
      orgId,
      user.sub,
      { question: body.question, assumptions: body.assumptions },
      req.traceId,
    );
  }
}
