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
import { WorkflowsService, type WorkflowStep } from "./workflows.service.js";

@Controller("orgs/:orgId/workflows")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  @Roles("owner", "manager")
  list(@Param("orgId") orgId: string) {
    return this.workflows.list(orgId);
  }

  @Post()
  @Roles("owner", "manager")
  create(
    @Param("orgId") orgId: string,
    @CurrentUser() user: JwtClaims,
    @Body()
    body: { code?: string; name?: string; triggerType?: string; approvalPolicy?: string; steps?: WorkflowStep[] },
    @Req() req: ApiRequest,
  ) {
    if (!body?.code || !body?.name || !body?.steps) {
      throw new BadRequestException("code, name and steps are required");
    }
    return this.workflows.create(
      orgId,
      user.sub,
      {
        code: body.code,
        name: body.name,
        triggerType: body.triggerType,
        approvalPolicy: body.approvalPolicy,
        steps: body.steps,
      },
      req.traceId,
    );
  }

  @Post(":id/run")
  @Roles("owner", "manager")
  run(
    @Param("orgId") orgId: string,
    @Param("id") id: string,
    @CurrentUser() user: JwtClaims,
    @Req() req: ApiRequest,
  ) {
    return this.workflows.run(orgId, id, user.sub, req.traceId);
  }

  @Get(":id/runs")
  @Roles("owner", "manager")
  runs(@Param("orgId") orgId: string, @Param("id") id: string) {
    return this.workflows.runs(orgId, id);
  }
}
