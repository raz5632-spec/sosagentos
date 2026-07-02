import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { getDb } from "@salesos/db";
import type { ApiRequest } from "../common/request.js";

/**
 * Tenant isolation: the :orgId route param must correspond to an organization
 * the authenticated user is a member of. Attaches { orgId, roleCode } to the request.
 * Must run after JwtAuthGuard.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<ApiRequest>();
    const orgIdParam = req.params.orgId;
    const orgId = typeof orgIdParam === "string" ? orgIdParam : undefined;
    const userId = req.user?.sub;
    if (!orgId || !userId) throw new ForbiddenException("missing tenant context");

    const membership = await getDb().membership.findFirst({
      where: { orgId, userId },
      include: { role: true },
    });
    if (!membership) throw new ForbiddenException("not a member of this organization");

    req.tenant = { orgId, roleCode: membership.role.code };
    return true;
  }
}
