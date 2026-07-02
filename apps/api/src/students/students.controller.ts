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
import { StudentsService } from "./students.service.js";

@Controller("orgs/:orgId/students")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  @Roles("owner", "manager", "coach")
  list(@Param("orgId") orgId: string) {
    return this.students.list(orgId);
  }

  @Post()
  @Roles("owner", "manager")
  enroll(
    @Param("orgId") orgId: string,
    @CurrentUser() user: JwtClaims,
    @Body() body: { email?: string; displayName?: string; primaryCoachUserId?: string },
    @Req() req: ApiRequest,
  ) {
    if (!body?.email || !body?.displayName) {
      throw new BadRequestException("email and displayName are required");
    }
    return this.students.enroll(
      orgId,
      user.sub,
      { email: body.email, displayName: body.displayName, primaryCoachUserId: body.primaryCoachUserId },
      req.traceId,
    );
  }

  @Get(":id")
  @Roles("owner", "manager", "coach")
  get(@Param("orgId") orgId: string, @Param("id") id: string) {
    return this.students.get(orgId, id);
  }

  @Get(":id/timeline")
  @Roles("owner", "manager", "coach")
  timeline(@Param("orgId") orgId: string, @Param("id") id: string) {
    return this.students.timeline(orgId, id);
  }

  @Post(":id/notes")
  @Roles("owner", "manager", "coach")
  note(
    @Param("orgId") orgId: string,
    @Param("id") id: string,
    @CurrentUser() user: JwtClaims,
    @Body() body: { content?: string },
    @Req() req: ApiRequest,
  ) {
    if (!body?.content?.trim()) throw new BadRequestException("content is required");
    return this.students.addNote(orgId, id, user.sub, body.content, req.traceId);
  }

  @Post(":id/assess")
  @Roles("owner", "manager", "coach")
  assess(
    @Param("orgId") orgId: string,
    @Param("id") id: string,
    @CurrentUser() user: JwtClaims,
    @Req() req: ApiRequest,
  ) {
    return this.students.assess(orgId, id, user.sub, req.traceId);
  }

  @Post(":id/suggest")
  @Roles("owner", "manager", "coach")
  suggest(
    @Param("orgId") orgId: string,
    @Param("id") id: string,
    @CurrentUser() user: JwtClaims,
    @Req() req: ApiRequest,
  ) {
    return this.students.suggestInterventions(orgId, id, user.sub, req.traceId);
  }
}
