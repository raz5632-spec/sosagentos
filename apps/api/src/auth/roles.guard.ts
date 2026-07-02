import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ApiRequest } from "../common/request.js";

export const ROLES_KEY = "salesos:roles";
/** Restrict a route to members holding one of the given role codes within the tenant. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/** Must run after TenantGuard (relies on req.tenant.roleCode). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<ApiRequest>();
    const roleCode = req.tenant?.roleCode;
    if (!roleCode || !required.includes(roleCode)) {
      throw new ForbiddenException(`requires role: ${required.join(" or ")}`);
    }
    return true;
  }
}
