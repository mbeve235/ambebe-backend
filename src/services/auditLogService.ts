import { prisma } from "../config/prisma.js";

export async function writeAuditLog(actorId: string | null, action: string, entity: string, entityId: string | null, meta: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: {
      actorId,
      action,
      entity,
      entityId,
      meta
    }
  });
}
