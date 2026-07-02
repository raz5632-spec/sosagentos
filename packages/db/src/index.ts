import { PrismaClient, Prisma } from "@prisma/client";

export * from "@prisma/client";

let client: PrismaClient | undefined;

export function getDb(): PrismaClient {
  if (!client) client = new PrismaClient();
  return client;
}

export interface AuditInput {
  orgId: string;
  actorType: "user" | "agent" | "system";
  actorId: string;
  action: string;
  subjectType: string;
  subjectId: string;
  traceId?: string;
  payload?: Prisma.InputJsonValue;
}

/** Write to the global audit ledger. Every material action goes through here. */
export async function writeAudit(input: AuditInput, db: PrismaClient = getDb()) {
  return db.auditEvent.create({
    data: {
      orgId: input.orgId,
      actorType: input.actorType,
      actorId: input.actorId,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      traceId: input.traceId,
      payloadJson: input.payload,
    },
  });
}
