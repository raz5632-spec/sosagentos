import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { ApiRequest } from "../common/request.js";
import { AuthService } from "./auth.service.js";
import { JwtAuthGuard, CurrentUser } from "./jwt.guard.js";
import type { JwtClaims } from "./auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  async login(@Body() body: { email?: string; password?: string }, @Req() req: ApiRequest) {
    if (!body?.email || !body?.password) {
      throw new BadRequestException("email and password are required");
    }
    return this.auth.login(body.email, body.password, req.traceId);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtClaims) {
    return this.auth.profile(user.sub);
  }
}
