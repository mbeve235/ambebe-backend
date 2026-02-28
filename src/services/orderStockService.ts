import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";

const STOCK_REASON_PREFIX = "ORDER";
const FINAL_ORDER_STATUS = new Set(["PAID", "SHIPPED"]);
const FINAL_PAYMENT_STATUS = new Set(["AUTHORIZED", "CAPTURED"]);

function buildOrderItemStockReason(orderId: string, orderItemId: string) {
  return `${STOCK_REASON_PREFIX}:${orderId}:${orderItemId}`;
}

export function shouldDeductStockForOrderState(
  orderStatus?: string | null,
  paymentStatus?: string | null
) {
  return FINAL_ORDER_STATUS.has(orderStatus ?? "") || FINAL_PAYMENT_STATUS.has(paymentStatus ?? "");
}

export async function ensureOrderStockDeducted(orderId: string) {
  await prisma.$transaction(
    async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true }
      });
      if (!order) {
        throw new ApiError(404, "not_found", "Order not found");
      }

      for (const item of order.items) {
        if (!item.variantId || item.quantity <= 0) {
          continue;
        }

        const stockItem = await tx.stockItem.findUnique({ where: { variantId: item.variantId } });
        if (!stockItem) {
          throw new ApiError(409, "stock_item_missing", "Item de estoque nao encontrado para a variante");
        }

        const reason = buildOrderItemStockReason(order.id, item.id);
        const existingMovement = await tx.stockMovement.findFirst({
          where: { stockItemId: stockItem.id, reason }
        });
        if (existingMovement) {
          continue;
        }

        if (stockItem.onHand < item.quantity) {
          throw new ApiError(409, "insufficient_stock", "Estoque insuficiente para concluir o pedido");
        }

        await tx.stockMovement.create({
          data: {
            stockItemId: stockItem.id,
            delta: -item.quantity,
            reason
          }
        });

        await tx.stockItem.update({
          where: { id: stockItem.id },
          data: { onHand: { decrement: item.quantity } }
        });
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

