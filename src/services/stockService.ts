import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";

export async function adjustStock(variantId: string, delta: number, reason: string) {
  const stockItem = await prisma.stockItem.findUnique({ where: { variantId } });
  if (!stockItem) {
    throw new ApiError(404, "not_found", "Stock item not found");
  }

  return prisma.$transaction(async (tx) => {
    const movement = await tx.stockMovement.create({
      data: {
        stockItemId: stockItem.id,
        delta,
        reason
      }
    });

    const updated = await tx.stockItem.update({
      where: { id: stockItem.id },
      data: { onHand: { increment: delta } }
    });

    return { movement, stock: updated };
  });
}
