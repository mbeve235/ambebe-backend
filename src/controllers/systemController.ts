import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { logger } from "../config/logger.js";
import { constructStripeEvent } from "../services/stripeService.js";
import {
  ensureOrderStockDeducted,
  ensureOrderStockRestored,
  shouldDeductStockForOrderState,
  shouldRestoreStockForOrderCancellation
} from "../services/orderStockService.js";

export async function health(_req: Request, res: Response) {
  res.json({ status: "ok" });
}

export async function ready(_req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ready" });
  } catch (err) {
    next(new ApiError(503, "not_ready", "Database not reachable"));
  }
}

export async function metrics(_req: Request, res: Response) {
  res.json({ status: "ok" });
}

export async function paymentWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const { orderId, paymentId, paymentStatus, orderStatus } = req.body || {};
    let resolvedOrderId: string | null = orderId ?? null;

    if (!orderId && !paymentId) {
      throw new ApiError(400, "missing_reference", "orderId or paymentId is required");
    }

    if (paymentId) {
      const updatedPayment = await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: paymentStatus
        }
      });
      resolvedOrderId = resolvedOrderId ?? updatedPayment.orderId;
    } else if (orderId && paymentStatus) {
      await prisma.payment.updateMany({
        where: { orderId },
        data: {
          status: paymentStatus
        }
      });
    }

    if (orderId && orderStatus) {
      const previousOrder = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, status: true, paymentStatus: true }
      });
      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: {
          status: orderStatus,
          paymentStatus: paymentStatus ?? undefined
        }
      });
      if (shouldDeductStockForOrderState(updatedOrder.status, updatedOrder.paymentStatus)) {
        await ensureOrderStockDeducted(updatedOrder.id);
      }
      if (
        previousOrder &&
        shouldRestoreStockForOrderCancellation(previousOrder.status, previousOrder.paymentStatus, updatedOrder.status)
      ) {
        await ensureOrderStockRestored(updatedOrder.id);
      }
    } else if (resolvedOrderId && shouldDeductStockForOrderState(undefined, paymentStatus)) {
      await ensureOrderStockDeducted(resolvedOrderId);
    }

    res.json({ status: "ok" });
  } catch (err) {
    next(err);
  }
}

export async function stripeWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const signature = req.header("stripe-signature");
    if (!signature) {
      throw new ApiError(400, "missing_signature", "Stripe signature required");
    }
    if (!Buffer.isBuffer(req.body)) {
      throw new ApiError(400, "invalid_payload", "Stripe webhook expects raw body");
    }

    const event = constructStripeEvent(req.body, signature);
    const eventType = event.type;

    const audit = async (meta: Record<string, unknown>) => {
      try {
        await prisma.auditLog.create({
          data: {
            actorId: null,
            action: "stripe_webhook",
            entity: "system",
            entityId: meta.paymentId ? String(meta.paymentId) : meta.orderId ? String(meta.orderId) : null,
            meta: meta as Prisma.InputJsonValue
          }
        });
      } catch (err) {
        logger.warn({ err }, "Stripe webhook audit log failed");
      }
    };

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      const session = event.data.object as {
        id: string;
        payment_status?: string;
        metadata?: { orderId?: string; paymentId?: string };
      };
      const orderId = session.metadata?.orderId;
      const paymentId = session.metadata?.paymentId;

      if (!orderId && !paymentId) {
        await audit({
          provider: "stripe",
          eventId: event.id,
          eventType,
          status: session.payment_status ?? null
        });
        return res.json({ received: true });
      }

      if (session.payment_status === "paid") {
        let resolvedOrderId: string | undefined = orderId ?? undefined;
        if (!resolvedOrderId && paymentId) {
          const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
          resolvedOrderId = payment?.orderId ?? undefined;
        }

        if (paymentId) {
          await prisma.payment.update({
            where: { id: paymentId },
            data: { status: "CAPTURED", provider: "STRIPE", externalRef: session.id }
          });
        } else if (orderId) {
          await prisma.payment.updateMany({
            where: { orderId },
            data: { status: "CAPTURED", provider: "STRIPE", externalRef: session.id }
          });
        }

        if (resolvedOrderId) {
          const updatedOrder = await prisma.order.update({
            where: { id: resolvedOrderId },
            data: { paymentStatus: "CAPTURED", status: "PAID" }
          });
          await ensureOrderStockDeducted(updatedOrder.id);
        }

        await audit({
          provider: "stripe",
          eventId: event.id,
          eventType,
          orderId: resolvedOrderId ?? orderId,
          paymentId,
          paymentStatus: "CAPTURED",
          orderStatus: "PAID"
        });
      }

      if (session.payment_status === "unpaid" && orderId) {
        await prisma.order.update({
          where: { id: orderId },
          data: { paymentStatus: "FAILED" }
        });

        await audit({
          provider: "stripe",
          eventId: event.id,
          eventType,
          orderId,
          paymentId,
          paymentStatus: "FAILED"
        });
      }

      logger.info(
        {
          eventId: event.id,
          eventType,
          orderId,
          paymentId,
          status: session.payment_status
        },
        "Stripe webhook processed"
      );
    }

    if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as {
        id: string;
        status?: string;
        metadata?: { orderId?: string; paymentId?: string };
      };

      let orderId = intent.metadata?.orderId ?? null;
      const paymentId = intent.metadata?.paymentId ?? null;

      if (!orderId && paymentId) {
        const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
        orderId = payment?.orderId ?? null;
      }

      if (event.type === "payment_intent.succeeded") {
        if (paymentId) {
          await prisma.payment.update({
            where: { id: paymentId },
            data: { status: "CAPTURED", provider: "STRIPE", externalRef: intent.id }
          });
        } else if (orderId) {
          await prisma.payment.updateMany({
            where: { orderId },
            data: { status: "CAPTURED", provider: "STRIPE", externalRef: intent.id }
          });
        }

        if (orderId) {
          const updatedOrder = await prisma.order.update({
            where: { id: orderId },
            data: { paymentStatus: "CAPTURED", status: "PAID" }
          });
          await ensureOrderStockDeducted(updatedOrder.id);
        }

        await audit({
          provider: "stripe",
          eventId: event.id,
          eventType,
          orderId,
          paymentId,
          paymentStatus: "CAPTURED",
          orderStatus: orderId ? "PAID" : null
        });
      }

      if (event.type === "payment_intent.payment_failed") {
        if (paymentId) {
          await prisma.payment.update({
            where: { id: paymentId },
            data: { status: "FAILED", provider: "STRIPE", externalRef: intent.id }
          });
        } else if (orderId) {
          await prisma.payment.updateMany({
            where: { orderId },
            data: { status: "FAILED", provider: "STRIPE", externalRef: intent.id }
          });
        }

        if (orderId) {
          await prisma.order.update({
            where: { id: orderId },
            data: { paymentStatus: "FAILED" }
          });
        }

        await audit({
          provider: "stripe",
          eventId: event.id,
          eventType,
          orderId,
          paymentId,
          paymentStatus: "FAILED"
        });
      }

      logger.info(
        {
          eventId: event.id,
          eventType,
          orderId,
          paymentId,
          intentStatus: intent.status
        },
        "Stripe payment intent webhook processed"
      );
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
}
