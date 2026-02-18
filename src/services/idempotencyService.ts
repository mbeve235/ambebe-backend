import { prisma } from "../config/prisma.js";
import { sha256 } from "../utils/hash.js";

export async function getIdempotentResponse(userId: string, key: string, body: unknown) {
  const requestHash = sha256(JSON.stringify(body || {}));
  const existing = await prisma.idempotencyKey.findUnique({
    where: { key_userId: { key, userId } }
  });

  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new Error("Idempotency key reuse with different payload");
    }
    return { hit: true as const, responseBody: existing.responseBody };
  }

  return { hit: false as const, requestHash };
}

export async function storeIdempotentResponse(userId: string, key: string, requestHash: string, responseBody: unknown) {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.idempotencyKey.create({
    data: {
      key,
      userId,
      requestHash,
      responseBody,
      expiresAt
    }
  });
}
