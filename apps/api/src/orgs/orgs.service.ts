import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { getDb, writeAudit } from "@salesos/db";

@Injectable()
export class OrgsService {
  async listMembers(orgId: string) {
    const members = await getDb().membership.findMany({
      where: { orgId },
      include: { user: true, role: true },
      orderBy: { user: { displayName: "asc" } },
    });
    return members.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      displayName: m.user.displayName,
      role: m.role.code,
      status: m.user.status,
    }));
  }

  async addMember(
    orgId: string,
    actorUserId: string,
    input: { email: string; displayName: string; roleCode: string; password?: string },
    traceId?: string,
  ) {
    const db = getDb();
    const role = await db.role.findUnique({ where: { code: input.roleCode } });
    if (!role) throw new NotFoundException(`unknown role: ${input.roleCode}`);
    if (input.roleCode === "owner") {
      throw new BadRequestException("owner role can only be granted via seed/console");
    }

    const passwordHash = input.password ? await bcrypt.hash(input.password, 10) : undefined;
    const user = await db.user.upsert({
      where: { email: input.email },
      update: {},
      create: { email: input.email, displayName: input.displayName, passwordHash },
    });

    const membership = await db.membership.upsert({
      where: { orgId_userId_roleId: { orgId, userId: user.id, roleId: role.id } },
      update: {},
      create: { orgId, userId: user.id, roleId: role.id },
    });

    await writeAudit({
      orgId,
      actorType: "user",
      actorId: actorUserId,
      action: "membership.created",
      subjectType: "membership",
      subjectId: membership.id,
      traceId,
      payload: { email: input.email, role: input.roleCode },
    });

    return { userId: user.id, email: user.email, role: role.code };
  }
}
