import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { JwtClaims } from "./auth.service.js";
import type { ApiRequest } from "../common/request.js";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<ApiRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("missing bearer token");
    try {
      req.user = await this.jwt.verifyAsync<JwtClaims>(header.slice(7));
      return true;
    } catch {
      throw new UnauthorizedException("invalid or expired token");
    }
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<ApiRequest>().user;
});
