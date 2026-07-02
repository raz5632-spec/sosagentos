import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { getDb, writeAudit } from "@salesos/db";

export interface JwtClaims {
  sub: string;
  email: string;
  displayName: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  async login(email: string, password: string, traceId?: string) {
    const db = getDb();
    const user = await db.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash || user.status !== "active") {
      throw new UnauthorizedException("invalid credentials");
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("invalid credentials");

    const memberships = await db.membership.findMany({
      where: { userId: user.id },
      include: { role: true, organization: true },
    });

    const claims: JwtClaims = { sub: user.id, email: user.email, displayName: user.displayName };
    const token = await this.jwt.signAsync(claims);

    const orgId = memberships[0]?.orgId;
    if (orgId) {
      await writeAudit({
        orgId,
        actorType: "user",
        actorId: user.id,
        action: "auth.login",
        subjectType: "user",
        subjectId: user.id,
        traceId,
      });
    }

    return {
      token,
      user: { id: user.id, email: user.email, displayName: user.displayName },
      organizations: memberships.map((m) => ({
        orgId: m.orgId,
        orgSlug: m.organization.slug,
        orgName: m.organization.name,
        role: m.role.code,
      })),
    };
  }

  async profile(userId: string) {
    const db = getDb();
    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, status: true },
    });
    const memberships = await db.membership.findMany({
      where: { userId },
      include: { role: true, organization: true },
    });
    return {
      ...user,
      organizations: memberships.map((m) => ({
        orgId: m.orgId,
        orgSlug: m.organization.slug,
        orgName: m.organization.name,
        role: m.role.code,
      })),
    };
  }
}
