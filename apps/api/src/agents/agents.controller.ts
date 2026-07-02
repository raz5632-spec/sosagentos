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
import { AgentsService } from "./agents.service.js";
import type { ApprovalLevel } from "@salesos/contracts";
import type { TaskClass } from "@salesos/ai";

@Controller("orgs/:orgId/agents")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  @Roles("owner", "manager")
  list() {
    return this.agents.listAgents();
  }

  @Get("invocations")
  @Roles("owner", "manager")
  invocations(@Query("limit") limit?: string) {
    return this.agents.listInvocations(limit ? Number(limit) : undefined);
  }

  @Post(":agentCode/invoke")
  @Roles("owner", "manager")
  invoke(
    @Param("orgId") orgId: string,
    @Param("agentCode") agentCode: string,
    @CurrentUser() user: JwtClaims,
    @Body()
    body: {
      objective?: string;
      approvalLevel?: ApprovalLevel;
      taskClass?: TaskClass;
      context?: string;
      approved?: boolean;
      budgetTokens?: number;
    },
    @Req() req: ApiRequest,
  ) {
    if (!body?.objective) throw new BadRequestException("objective is required");
    return this.agents.invoke(
      orgId,
      user.sub,
      {
        agentCode,
        objective: body.objective,
        approvalLevel: body.approvalLevel,
        taskClass: body.taskClass,
        context: body.context,
        approved: body.approved,
        budgetTokens: body.budgetTokens,
      },
      req.traceId,
    );
  }
}
