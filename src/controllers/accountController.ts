import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";
import { ApiError } from "../utils/apiError.js";
import { addCartItem, deleteCartItem, getOrCreateCart, updateCartItem } from "../services/cartService.js";
import { checkoutCart, getCheckoutSummary } from "../services/orderService.js";
import { createStripeCheckoutSession, getStripeCheckoutSession } from "../services/stripeService.js";
import { buildStripeLineItems } from "../services/stripeLineItemService.js";
import { createMpesaPayment, normalizeMpesaMsisdn } from "../services/mpesaService.js";
import { writeAuditLog } from "../services/auditLogService.js";
import { getIdempotentResponse, storeIdempotentResponse } from "../services/idempotencyService.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { sendSupportMessageEmail } from "../services/mailService.js";

function getAssetBaseUrl(req: Request) {
  const configured = process.env.ASSET_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const forwardedProto = req.headers["x-forwarded-proto"];
  const forwardedHost = req.headers["x-forwarded-host"];
  const proto =
    (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) ??
    req.protocol;
  const host =
    (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) ??
    req.get("host");
  if (!host) return undefined;
  return `${proto}://${host}`;
}

async function resolveMpesaPhone(userId: string, override?: string | null) {
  const raw = override?.trim();
  if (raw) {
    try {
      return normalizeMpesaMsisdn(raw);
    } catch (error) {
      throw new ApiError(400, "mpesa_phone_invalid", error instanceof Error ? error.message : "Numero M-PESA invalido");
    }
  }
  const defaultAddress = await prisma.address.findFirst({
    where: { userId, isDefault: true, phone: { not: null } }
  });
  const fallback = defaultAddress ?? (await prisma.address.findFirst({ where: { userId, phone: { not: null } } }));
  if (!fallback?.phone) {
    throw new ApiError(400, "mpesa_phone_missing", "Informe um telefone M-PESA ou defina um endereco com telefone.");
  }
  try {
    return normalizeMpesaMsisdn(fallback.phone);
  } catch (error) {
    throw new ApiError(400, "mpesa_phone_invalid", error instanceof Error ? error.message : "Numero M-PESA invalido");
  }
}

export const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(120)
  })
});

export const updatePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(8),
    newPassword: z.string().min(8)
  })
});

export const addressSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    line1: z.string().trim().min(2),
    line2: z.string().trim().optional(),
    city: z.string().trim().min(2),
    state: z.string().trim().min(2),
    postalCode: z.string().trim().min(3),
    country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Country must be 2 letters"),
    phone: z.string().trim().optional(),
    isDefault: z.boolean().optional()
  })
});

export const updateAddressSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    line1: z.string().trim().min(2).optional(),
    line2: z.string().trim().optional(),
    city: z.string().trim().min(2).optional(),
    state: z.string().trim().min(2).optional(),
    postalCode: z.string().trim().min(3).optional(),
    country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Country must be 2 letters").optional(),
    phone: z.string().trim().optional(),
    isDefault: z.boolean().optional()
  })
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() })
});

export const addCartItemSchema = z.object({
  body: z.object({
    productId: z.string().min(1),
    variantId: z.string().min(1).nullable().optional(),
    quantity: z.coerce.number().int().min(1)
  })
});

export const updateCartItemSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ quantity: z.number().int().min(1) })
});

export const upsertCartItemSchema = z.object({
  params: z.object({ variantId: z.string().uuid() }),
  body: z.object({ quantity: z.number().int().min(1) })
});

export const checkoutSchema = z.object({
  body: z
    .object({
      couponCode: z.string().min(3).max(50).optional(),
      paymentProvider: z.enum(["MPESA", "EMOLA", "STRIPE", "COD", "PAYPAL"]).optional(),
      phone: z.string().min(7).max(20).optional()
    })
    .optional()
    .default({}),
  headers: z
    .object({
      "idempotency-key": z.string().min(8)
    })
    .passthrough()
});

export const createPaymentSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      provider: z.enum(["MPESA", "EMOLA", "STRIPE", "COD", "PAYPAL"]).optional(),
      phone: z.string().min(7).max(20).optional()
    })
    .optional()
    .default({}),
  headers: z
    .object({
      "idempotency-key": z.string().min(8)
    })
    .passthrough()
});

export const confirmStripePaymentSchema = z.object({
  body: z.object({
    sessionId: z.string().min(10)
  })
});

export const supportMessageSchema = z.object({
  body: z.object({
    subject: z.string().trim().min(3).max(200),
    message: z.string().trim().min(10).max(3000)
  })
});

export const supportMessageListSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional()
  })
});

export const notificationPreferencesSchema = z.object({
  body: z
    .object({
      newProductNotificationsEnabled: z.boolean().optional()
    })
    .optional()
    .default({})
});

export const markNotificationReadSchema = z.object({
  body: z.object({
    kind: z.enum(["product", "support"]),
    seenAt: z.string().datetime()
  })
});

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    res.json({ id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.roleId });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { name: req.body.name }
    });
    res.json({ id: user.id, email: user.email, name: user.name, role: user.roleId });
  } catch (err) {
    next(err);
  }
}

export async function updatePassword(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) throw new ApiError(404, "not_found", "User not found");
    const ok = await verifyPassword(user.passwordHash, req.body.currentPassword);
    if (!ok) throw new ApiError(400, "invalid_password", "Current password is incorrect");
    const passwordHash = await hashPassword(req.body.newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function listAddresses(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const addresses = await prisma.address.findMany({ where: { userId: req.user.id } });
    res.json({ items: addresses });
  } catch (err) {
    next(err);
  }
}

export async function createAddress(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const address = await prisma.address.create({
      data: {
        userId: req.user.id,
        ...req.body
      }
    });
    res.status(201).json(address);
  } catch (err) {
    next(err);
  }
}

export async function updateAddress(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const address = await prisma.address.findUnique({ where: { id: req.params.id } });
    if (!address || address.userId !== req.user.id) {
      throw new ApiError(404, "not_found", "Address not found");
    }
    const updated = await prisma.address.update({ where: { id: address.id }, data: req.body });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteAddress(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const address = await prisma.address.findUnique({ where: { id: req.params.id } });
    if (!address || address.userId !== req.user.id) {
      throw new ApiError(404, "not_found", "Address not found");
    }
    await prisma.address.delete({ where: { id: address.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function setDefaultAddress(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const address = await prisma.address.findUnique({ where: { id: req.params.id } });
    if (!address || address.userId !== req.user.id) {
      throw new ApiError(404, "not_found", "Address not found");
    }
    await prisma.$transaction([
      prisma.address.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false }
      }),
      prisma.address.update({
        where: { id: address.id },
        data: { isDefault: true }
      })
    ]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function listSessions(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const sessions = await prisma.refreshToken.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" }
    });
    res.json({ items: sessions });
  } catch (err) {
    next(err);
  }
}

export async function revokeSession(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    await prisma.refreshToken.updateMany({
      where: { id: req.params.id, userId: req.user.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getCart(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const cart = await getOrCreateCart(req.user.id);
    res.json(cart);
  } catch (err) {
    next(err);
  }
}

export async function addItem(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const item = await addCartItem(req.user.id, req.body);
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
}

export async function updateItem(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const item = await updateCartItem(req.user.id, req.params.id, req.body.quantity);
    res.json(item);
  } catch (err) {
    next(err);
  }
}

export async function deleteItem(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    await deleteCartItem(req.user.id, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function clearCart(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const cart = await getOrCreateCart(req.user.id);
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function upsertCartItemByVariant(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const variant = await prisma.productVariant.findUnique({ where: { id: req.params.variantId } });
    if (!variant) throw new ApiError(404, "not_found", "Variant not found");
    const cart = await getOrCreateCart(req.user.id);
    const existing = await prisma.cartItem.findFirst({
      where: { cartId: cart.id, variantId: variant.id }
    });
    if (existing) {
      const updated = await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: req.body.quantity }
      });
      return res.json(updated);
    }
    const item = await addCartItem(req.user.id, {
      productId: variant.productId,
      variantId: variant.id,
      quantity: req.body.quantity
    });
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
}

export async function checkoutSummary(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const rawCoupon =
      typeof req.query.coupon === "string"
        ? req.query.coupon
        : typeof req.query.couponCode === "string"
          ? req.query.couponCode
          : undefined;
    const summary = await getCheckoutSummary(req.user.id, rawCoupon);
    res.json(summary);
  } catch (err) {
    next(err);
  }
}

export async function checkout(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const key = req.header("Idempotency-Key");
    if (!key) {
      throw new ApiError(400, "missing_idempotency_key", "Idempotency-Key header required");
    }

    const idempotency = await getIdempotentResponse(req.user.id, key, req.body);
    if (idempotency.hit) {
      return res.json(idempotency.responseBody);
    }

    const order = await checkoutCart(req.user.id, req.body.couponCode, req.body.paymentProvider);
    const userSummary = { id: req.user.id, email: req.user.email, name: req.user.name };

    let paymentWithExtras: (typeof order.payment & { checkoutUrl?: string | null }) | null = order.payment;
    if (req.body.paymentProvider === "STRIPE" && order.payment) {
      const lineItems = await buildStripeLineItems(order.items ?? [], getAssetBaseUrl(req));
      const session = await createStripeCheckoutSession({
        orderId: order.id,
        paymentId: order.payment.id,
        currency: order.currency,
        customerEmail: req.user.email,
        amount: Number(order.total),
        lineItems
      });
      await prisma.payment.update({
        where: { id: order.payment.id },
        data: { externalRef: session.id, provider: "STRIPE" }
      });
      paymentWithExtras = { ...order.payment, externalRef: session.id, checkoutUrl: session.url };
    } else if (req.body.paymentProvider === "MPESA" && order.payment) {
      const msisdn = await resolveMpesaPhone(req.user.id, req.body.phone ?? null);
      const result = await createMpesaPayment({
        amount: Number(order.total),
        customerMsisdn: msisdn,
        orderId: order.id,
        paymentId: order.payment.id
      });
      const paymentStatus = result.ok ? "AUTHORIZED" : "FAILED";
      const updatedPayment = await prisma.payment.update({
        where: { id: order.payment.id },
        data: {
          provider: "MPESA",
          externalRef: result.transactionId ?? undefined,
          status: paymentStatus
        }
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus }
      });
      void writeAuditLog(req.user.id, "mpesa_payment", "payment", updatedPayment.id, {
        orderId: order.id,
        paymentId: updatedPayment.id,
        responseCode: result.responseCode,
        responseDesc: result.responseDesc,
        transactionId: result.transactionId,
        status: paymentStatus
      }).catch((err) => {
        logger.warn({ err }, "Failed to write M-PESA audit log");
      });
      paymentWithExtras = updatedPayment;
    }

    const responseBody = { ...order, payment: paymentWithExtras, user: userSummary };
    await storeIdempotentResponse(req.user.id, key, idempotency.requestHash, responseBody);
    res.status(201).json(responseBody);
  } catch (err) {
    if (err instanceof Error && err.message.includes("Idempotency")) {
      return next(new ApiError(409, "idempotency_conflict", err.message));
    }
    next(err);
  }
}

export async function listOrders(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      include: { items: true, payment: true },
      orderBy: { createdAt: "desc" }
    });
    res.json({ items: orders });
  } catch (err) {
    next(err);
  }
}

export async function getOrder(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: true, payment: true }
    });
    if (!order || order.userId !== req.user.id) {
      throw new ApiError(404, "not_found", "Order not found");
    }
    res.json(order);
  } catch (err) {
    next(err);
  }
}

export async function listOrderItems(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order || order.userId !== req.user.id) {
      throw new ApiError(404, "not_found", "Order not found");
    }
    const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

export async function cancelOrder(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order || order.userId !== req.user.id) {
      throw new ApiError(404, "not_found", "Order not found");
    }
    if (order.status !== "PENDING") {
      throw new ApiError(400, "invalid_status", "Order cannot be canceled");
    }
    const updated = await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELED" } });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function createPayment(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const key = req.header("Idempotency-Key");
    if (!key) {
      throw new ApiError(400, "missing_idempotency_key", "Idempotency-Key header required");
    }

    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { payment: true, items: true }
    });
    if (!order || order.userId !== req.user.id) {
      throw new ApiError(404, "not_found", "Order not found");
    }
    const idempotency = await getIdempotentResponse(req.user.id, key, req.body);
    if (idempotency.hit) {
      return res.json(idempotency.responseBody);
    }

    const provider = req.body?.provider ?? order.payment?.provider ?? null;
    const userSummary = { id: req.user.id, email: req.user.email, name: req.user.name };

    if (provider === "STRIPE") {
      if (order.payment && order.payment.status !== "PENDING") {
        return res.json({ ...order.payment, user: userSummary });
      }

      const payment =
        order.payment ??
        (await prisma.payment.create({
          data: {
            orderId: order.id,
            amount: order.total,
            status: "PENDING",
            provider: "STRIPE"
          }
        }));

      const lineItems = await buildStripeLineItems(order.items ?? [], getAssetBaseUrl(req));
      const session = await createStripeCheckoutSession({
        orderId: order.id,
        paymentId: payment.id,
        currency: order.currency,
        customerEmail: req.user.email,
        amount: Number(order.total),
        lineItems
      });

      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: { externalRef: session.id, provider: "STRIPE" }
      });

      const responseBody = { ...updated, checkoutUrl: session.url, user: userSummary };
      await storeIdempotentResponse(req.user.id, key, idempotency.requestHash, responseBody);
      return res.status(201).json(responseBody);
    }

    if (provider === "MPESA") {
      if (order.payment && order.payment.status !== "FAILED") {
        return res.json({ ...order.payment, user: userSummary });
      }

      const payment =
        order.payment ??
        (await prisma.payment.create({
          data: {
            orderId: order.id,
            amount: order.total,
            status: "PENDING",
            provider: "MPESA"
          }
        }));

      const msisdn = await resolveMpesaPhone(req.user.id, req.body?.phone ?? null);
      const result = await createMpesaPayment({
        amount: Number(order.total),
        customerMsisdn: msisdn,
        orderId: order.id,
        paymentId: payment.id
      });
      const paymentStatus = result.ok ? "AUTHORIZED" : "FAILED";
      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          provider: "MPESA",
          externalRef: result.transactionId ?? undefined,
          status: paymentStatus
        }
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus }
      });
      void writeAuditLog(req.user.id, "mpesa_payment", "payment", updated.id, {
        orderId: order.id,
        paymentId: updated.id,
        responseCode: result.responseCode,
        responseDesc: result.responseDesc,
        transactionId: result.transactionId,
        status: paymentStatus
      }).catch((err) => {
        logger.warn({ err }, "Failed to write M-PESA audit log");
      });

      const responseBody = { ...updated, user: userSummary };
      await storeIdempotentResponse(req.user.id, key, idempotency.requestHash, responseBody);
      return res.status(201).json(responseBody);
    }

    if (order.payment) {
      return res.json({ ...order.payment, user: userSummary });
    }

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        amount: order.total,
        status: "PENDING",
        provider
      }
    });

    const responseBody = { ...payment, user: userSummary };
    await storeIdempotentResponse(req.user.id, key, idempotency.requestHash, responseBody);
    res.status(201).json(responseBody);
  } catch (err) {
    if (err instanceof Error && err.message.includes("Idempotency")) {
      return next(new ApiError(409, "idempotency_conflict", err.message));
    }
    next(err);
  }
}

export async function confirmStripePayment(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const session = await getStripeCheckoutSession(req.body.sessionId);
    const orderId = session.metadata?.orderId;
    const paymentId = session.metadata?.paymentId;

    if (!orderId || !paymentId) {
      throw new ApiError(400, "invalid_session", "Session metadata missing");
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== req.user.id) {
      throw new ApiError(404, "not_found", "Order not found");
    }

    if (session.payment_status === "paid") {
      await prisma.payment.update({
        where: { id: paymentId },
        data: { status: "CAPTURED", provider: "STRIPE", externalRef: session.id }
      });
      await prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: "CAPTURED", status: "PAID" }
      });
    }

    res.json({ status: session.payment_status });
  } catch (err) {
    next(err);
  }
}

export async function listOrderPayments(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order || order.userId !== req.user.id) {
      throw new ApiError(404, "not_found", "Order not found");
    }
    const payments = await prisma.payment.findMany({ where: { orderId: order.id } });
    res.json({ items: payments });
  } catch (err) {
    next(err);
  }
}

export async function getPayment(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { order: true } });
    if (!payment || payment.order.userId !== req.user.id) {
      throw new ApiError(404, "not_found", "Payment not found");
    }
    res.json(payment);
  } catch (err) {
    next(err);
  }
}

export async function listSupportMessages(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const skip = (page - 1) * limit;

    const [items, total] = await prisma.$transaction([
      prisma.supportMessage.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          replies: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { id: true, email: true, name: true } } }
          }
        }
      }),
      prisma.supportMessage.count({ where: { userId: req.user.id } })
    ]);

    res.json({ items, page, limit, total });
  } catch (err) {
    next(err);
  }
}

export async function createSupportMessage(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const { subject, message } = req.body;

    const supportMessage = await prisma.supportMessage.create({
      data: {
        userId: req.user.id,
        subject,
        message,
        status: "OPEN",
        isRead: false
      }
    });

    try {
      await sendSupportMessageEmail({
        userEmail: req.user.email,
        userName: req.user.name,
        subject,
        message,
        messageId: supportMessage.id
      });
    } catch (error) {
      logger.warn({ err: error, messageId: supportMessage.id }, "Support email failed");
    }

    res.status(201).json(supportMessage);
  } catch (err) {
    next(err);
  }
}

async function getOrCreateNotificationPreference(userId: string) {
  return prisma.notificationPreference.upsert({
    where: { userId },
    update: {},
    create: { userId }
  });
}

export async function getNotificationPreferences(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const preference = await getOrCreateNotificationPreference(req.user.id);
    res.json({
      newProductNotificationsEnabled: preference.newProductNotificationsEnabled,
      lastProductSeenAt: preference.lastProductSeenAt,
      lastSupportSeenAt: preference.lastSupportSeenAt
    });
  } catch (err) {
    next(err);
  }
}

export async function updateNotificationPreferences(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const preference = await getOrCreateNotificationPreference(req.user.id);
    const updated = await prisma.notificationPreference.update({
      where: { id: preference.id },
      data: {
        newProductNotificationsEnabled:
          typeof req.body.newProductNotificationsEnabled === "boolean"
            ? req.body.newProductNotificationsEnabled
            : preference.newProductNotificationsEnabled
      }
    });
    res.json({
      newProductNotificationsEnabled: updated.newProductNotificationsEnabled,
      lastProductSeenAt: updated.lastProductSeenAt,
      lastSupportSeenAt: updated.lastSupportSeenAt
    });
  } catch (err) {
    next(err);
  }
}

export async function markNotificationRead(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const preference = await getOrCreateNotificationPreference(req.user.id);
    const seenAt = new Date(req.body.seenAt);
    if (Number.isNaN(seenAt.getTime())) {
      throw new ApiError(400, "invalid_seen_at", "Invalid seenAt value");
    }

    const data: { lastProductSeenAt?: Date; lastSupportSeenAt?: Date } = {};
    if (req.body.kind === "product") {
      const current = preference.lastProductSeenAt?.getTime() ?? 0;
      if (seenAt.getTime() > current) {
        data.lastProductSeenAt = seenAt;
      }
    }
    if (req.body.kind === "support") {
      const current = preference.lastSupportSeenAt?.getTime() ?? 0;
      if (seenAt.getTime() > current) {
        data.lastSupportSeenAt = seenAt;
      }
    }

    const updated = Object.keys(data).length
      ? await prisma.notificationPreference.update({
          where: { id: preference.id },
          data
        })
      : preference;

    res.json({
      newProductNotificationsEnabled: updated.newProductNotificationsEnabled,
      lastProductSeenAt: updated.lastProductSeenAt,
      lastSupportSeenAt: updated.lastSupportSeenAt
    });
  } catch (err) {
    next(err);
  }
}
