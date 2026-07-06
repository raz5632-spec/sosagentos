import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { ApiRequest } from "../common/request.js";
import { JwtAuthGuard, CurrentUser } from "../auth/jwt.guard.js";
import { TenantGuard } from "../auth/tenant.guard.js";
import { Roles, RolesGuard } from "../auth/roles.guard.js";
import type { JwtClaims } from "../auth/auth.service.js";
import { KnowledgeService, extractText } from "./knowledge.service.js";

interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

@Controller("orgs/:orgId/knowledge")
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  @Roles("owner", "manager", "coach")
  list(@Param("orgId") orgId: string, @Query("status") status?: string) {
    return this.knowledge.list(orgId, status);
  }

  @Get("search")
  @Roles("owner", "manager", "coach")
  search(
    @Param("orgId") orgId: string,
    @Query("q") q?: string,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
  ) {
    if (!q?.trim()) throw new BadRequestException("query param q is required");
    return this.knowledge.search(orgId, q, { status, limit: limit ? Number(limit) : undefined });
  }

  @Get(":id")
  @Roles("owner", "manager", "coach")
  get(@Param("orgId") orgId: string, @Param("id") id: string) {
    return this.knowledge.get(orgId, id);
  }

  @Get(":id/edges")
  @Roles("owner", "manager", "coach")
  edges(@Param("orgId") orgId: string, @Param("id") id: string) {
    return this.knowledge.edges(orgId, id);
  }

  @Post(":id/edges")
  @Roles("owner", "manager")
  addEdge(
    @Param("orgId") orgId: string,
    @Param("id") id: string,
    @CurrentUser() user: JwtClaims,
    @Body() body: { toItemId?: string; relationType?: string; weight?: number },
    @Req() req: ApiRequest,
  ) {
    if (!body?.toItemId || !body?.relationType) {
      throw new BadRequestException("toItemId and relationType are required");
    }
    return this.knowledge.addEdge(
      orgId,
      id,
      { toItemId: body.toItemId, relationType: body.relationType, weight: body.weight },
      user.sub,
      req.traceId,
    );
  }

  @Post()
  @Roles("owner", "manager", "coach")
  capture(
    @Param("orgId") orgId: string,
    @CurrentUser() user: JwtClaims,
    @Body() body: { title?: string; type?: string; sourceType?: string; sourceRef?: string; content?: string },
    @Req() req: ApiRequest,
  ) {
    if (!body?.title || !body?.content) {
      throw new BadRequestException("title and content are required");
    }
    return this.knowledge.capture(
      orgId,
      user.sub,
      {
        title: body.title,
        type: body.type ?? "note",
        sourceType: body.sourceType ?? "manual",
        sourceRef: body.sourceRef,
        content: body.content,
      },
      req.traceId,
    );
  }

  @Post("upload")
  @Roles("owner", "manager", "coach")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 15 * 1024 * 1024 } }))
  async upload(
    @Param("orgId") orgId: string,
    @CurrentUser() user: JwtClaims,
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body() body: { title?: string; autoApprove?: string },
    @Req() req: ApiRequest,
  ) {
    if (!file) throw new BadRequestException("file is required");
    const text = (await extractText(file.originalname, file.mimetype, file.buffer)).trim();
    if (!text) throw new BadRequestException("could not extract any text from the file");
    const captured = await this.knowledge.capture(
      orgId,
      user.sub,
      {
        title: body?.title || file.originalname.replace(/\.[^.]+$/, ""),
        type: "training_material",
        sourceType: "file_upload",
        sourceRef: file.originalname,
        content: text,
      },
      req.traceId,
    );
    // CEO uploads are trusted: promote straight to memory unless asked otherwise.
    if (body?.autoApprove !== "false") {
      await this.knowledge.promote(orgId, captured.id, user.sub, req.traceId);
      return { ...captured, status: "production", chars: text.length };
    }
    await this.knowledge.submitForApproval(orgId, captured.id, user.sub, req.traceId);
    return { ...captured, status: "in_review", chars: text.length };
  }

  @Post(":id/submit")
  @Roles("owner", "manager", "coach")
  submit(
    @Param("orgId") orgId: string,
    @Param("id") id: string,
    @CurrentUser() user: JwtClaims,
    @Req() req: ApiRequest,
  ) {
    return this.knowledge.submitForApproval(orgId, id, user.sub, req.traceId);
  }
}
