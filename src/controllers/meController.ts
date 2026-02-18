import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";
import { ApiError } from "../utils/apiError.js";
import { addCartItem, deleteCartItem, getOrCreateCart, updateCartItem } from "../services/cartService.js";
import { checkoutCart } from "../services/orderService.js";
import { createStripeCheckoutSession } from "../services/stripeService.js";
import { buildStripeLineItems } from "../services/stripeLineItemService.js";
import { createMpesaPayment, normalizeMpesaMsisdn } from "../services/mpesaService.js";
import { writeAuditLog } from "../services/auditLogService.js";
import { getIdempotentResponse, storeIdempotentResponse } from "../services/idempotencyService.js";
import { hashPassword, verifyPassword } from "../utils/password.js";

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

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    res.json({ id: req.user.id, email: req.user.email, name: req.user.name });
  } catch (err) {
    next(err);
  }
}

export const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(120)
  })
});

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { name: req.body.name }
    });
    res.json({ id: user.id, email: user.email, name: user.name });
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

export const createAddressSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(120),
    line1: z.string().min(2),
    line2: z.string().optional(),
    city: z.string().min(2),
    state: z.string().min(2),
    postalCode: z.string().min(3),
    country: z.string().length(2),
    phone: z.string().optional(),
    isDefault: z.boolean().optional()
  })
});

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

export const updateAddressSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().min(2).max(120).optional(),
    line1: z.string().min(2).optional(),
    line2: z.string().optional(),
    city: z.string().min(2).optional(),
    state: z.string().min(2).optional(),
    postalCode: z.string().min(3).optional(),
    country: z.string().length(2).optional(),
    phone: z.string().optional(),
    isDefault: z.boolean().optional()
  })
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() })
});

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

export async function getCart(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const cart = await getOrCreateCart(req.user.id);
    res.json(cart);
  } catch (err) {
    next(err);
  }
}

export const addCartItemSchema = z.object({
  body: z.object({
    productId: z.string().min(1),
    variantId: z.string().min(1).nullable().optional(),
    quantity: z.coerce.number().int().min(1)
  })
});

export async function addItem(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const item = await addCartItem(req.user.id, req.body);
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
}

export const updateCartItemSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ quantity: z.number().int().min(1) })
});

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

export const checkoutSchema = z.object({
  body: z
    .object({
      couponCode: z.string().min(3).max(50).optional(),
      paymentProvider: z.enum(["MPESA", "EMOLA", "STRIPE", "COD", "PAYPAL"]).optional(),
      phone: z.string().min(7).max(20).optional()
    })
    .optional()
    .default({}),
  headers: z.object({
    "idempotency-key": z.string().min(8)
  }).passthrough()
});

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

    let paymentWithExtras = order.payment;
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

export const updatePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(8),
    newPassword: z.string().min(8)
  })
});

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
