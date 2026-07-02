import type { Request } from "express";
import type { JwtClaims } from "../auth/auth.service.js";

/** Request enriched by traceMiddleware, JwtAuthGuard, and TenantGuard. */
export interface ApiRequest extends Request {
  traceId?: string;
  user?: JwtClaims;
  tenant?: { orgId: string; roleCode: string };
}
