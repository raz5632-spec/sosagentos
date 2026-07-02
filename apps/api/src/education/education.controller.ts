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
import { EducationService } from "./education.service.js";

@Controller("orgs/:orgId")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class EducationController {
  constructor(private readonly education: EducationService) {}

  @Get("courses")
  @Roles("owner", "manager", "coach")
  listCourses(@Param("orgId") orgId: string) {
    return this.education.listCourses(orgId);
  }

  @Post("courses")
  @Roles("owner", "manager")
  createCourse(
    @Param("orgId") orgId: string,
    @CurrentUser() user: JwtClaims,
    @Body() body: { title?: string },
    @Req() req: ApiRequest,
  ) {
    if (!body?.title) throw new BadRequestException("title is required");
    return this.education.createCourse(orgId, user.sub, body.title, req.traceId);
  }

  @Post("courses/:courseId/lessons")
  @Roles("owner", "manager", "coach")
  createLesson(
    @Param("orgId") orgId: string,
    @Param("courseId") courseId: string,
    @CurrentUser() user: JwtClaims,
    @Body() body: { scheduledAt?: string; teacherUserId?: string },
    @Req() req: ApiRequest,
  ) {
    return this.education.createLesson(orgId, courseId, user.sub, body ?? {}, req.traceId);
  }

  @Get("lessons/:lessonId")
  @Roles("owner", "manager", "coach")
  getLesson(@Param("orgId") orgId: string, @Param("lessonId") lessonId: string) {
    return this.education.getLesson(orgId, lessonId);
  }

  @Post("lessons/:lessonId/transcript")
  @Roles("owner", "manager", "coach")
  ingestTranscript(
    @Param("orgId") orgId: string,
    @Param("lessonId") lessonId: string,
    @CurrentUser() user: JwtClaims,
    @Body() body: { text?: string; sttProvider?: string },
    @Req() req: ApiRequest,
  ) {
    if (!body?.text) throw new BadRequestException("text is required");
    return this.education.ingestTranscript(
      orgId,
      lessonId,
      user.sub,
      { text: body.text, sttProvider: body.sttProvider },
      req.traceId,
    );
  }
}
