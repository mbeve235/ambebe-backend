import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";

const STOCK_REASON_PREFIX = "ORDER";
const STOCK_RESTORE_REASON_PREFIX = "ORDER_RESTORE";
const FINAL_ORDER_STATUS = new Set(["PAID", "SHIPPED"]);
const FINAL_PAYMENT_STATUS = new Set(["AUTHORIZED", "CAPTURED"]);

function buildOrderItemStockReason(orderId: string, orderItemId: string) {
  return `${STOCK_REASON_PREFIX}:${orderId}:${orderItemId}`;
}

function buildOrderItemStockRestoreReason(orderId: string, orderItemId: string) {
  return `${STOCK_RESTORE_REASON_PREFIX}:${orderId}:${orderItemId}`;
}

export function shouldDeductStockForOrderState(
  orderStatus?: string | null,
  paymentStatus?: string | null
) {
  return FINAL_ORDER_STATUS.has(orderStatus ?? "") || FINAL_PAYMENT_STATUS.has(paymentStatus ?? "");
}

export function shouldRestoreStockForOrderCancellation(
  previousOrderStatus?: string | null,
  previousPaymentStatus?: string | null,
  nextOrderStatus?: string | null
) {
  return nextOrderStatus === "CANCELED" && shouldDeductStockForOrderState(previousOrderStatus, previousPaymentStatus);
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

export async function ensureOrderStockRestored(orderId: string) {
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
          continue;
        }

        const deductionReason = buildOrderItemStockReason(order.id, item.id);
        const deductionExists = await tx.stockMovement.findFirst({
          where: { stockItemId: stockItem.id, reason: deductionReason }
        });
        if (!deductionExists) {
          continue;
        }

        const restoreReason = buildOrderItemStockRestoreReason(order.id, item.id);
        const restoreExists = await tx.stockMovement.findFirst({
          where: { stockItemId: stockItem.id, reason: restoreReason }
        });
        if (restoreExists) {
          continue;
        }

        await tx.stockMovement.create({
          data: {
            stockItemId: stockItem.id,
            delta: item.quantity,
            reason: restoreReason
          }
        });

        await tx.stockItem.update({
          where: { id: stockItem.id },
          data: { onHand: { increment: item.quantity } }
        });
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}
