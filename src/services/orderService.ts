import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { normalizeCouponCode, resolveCoupon } from "./couponService.js";

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber?: unknown }).toNumber === "function") {
    try {
      const parsed = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(parsed) ? parsed : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

function extractCostFromAttributes(attributes: unknown) {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) return 0;
  const source = attributes as Record<string, unknown>;
  return toNumber(source.costPrice ?? source.cost ?? source.cmv ?? 0);
}

function normalizeAttributesSnapshot(
  current: Prisma.JsonValue | null,
  extras: Record<string, unknown>
): Prisma.InputJsonValue | Prisma.JsonNullValueInput {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  return { ...base, ...extras } as Prisma.InputJsonValue;
}

export type CheckoutOrder = Prisma.OrderGetPayload<{
  include: { items: true; payment: true };
}>;

async function generateNextOrderNumber(tx: Prisma.TransactionClient, date: Date) {
  const year = date.getFullYear();
  const prefix = `PED-${year}-`;
  const last = await tx.order.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true }
  });
  const lastSeqRaw = last?.orderNumber?.slice(prefix.length) ?? "0";
  const lastSeq = Number.parseInt(lastSeqRaw, 10);
  const nextSeq = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
  return `${prefix}${String(nextSeq).padStart(6, "0")}`;
}

export async function getCheckoutSummary(userId: string, couponCode?: string | null) {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: { items: true }
  });

  if (!cart) {
    return { items: [], subtotal: 0, discountTotal: 0, total: 0, couponCode: null };
  }

  const subtotal = cart.items.reduce((acc, item) => acc + Number(item.priceSnapshot) * item.quantity, 0);
  const normalized = normalizeCouponCode(couponCode ?? undefined);

  if (!normalized || subtotal === 0) {
    return { items: cart.items, subtotal, discountTotal: 0, total: subtotal, couponCode: null };
  }

  const { coupon, discountTotal } = await resolveCoupon(prisma, normalized, subtotal);
  const total = Math.max(0, subtotal - discountTotal);

  return {
    items: cart.items,
    subtotal,
    discountTotal,
    total,
    couponCode: coupon.code
  };
}

export async function checkoutCart(
  userId: string,
  couponCode?: string | null,
  paymentProvider?: string | null,
  customerPhoneOverride?: string | null
): Promise<CheckoutOrder> {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: { items: true }
  });

  if (!cart || cart.items.length === 0) {
    throw new ApiError(400, "empty_cart", "Cart is empty");
  }

  const subtotal = cart.items.reduce((acc, item) => acc + Number(item.priceSnapshot) * item.quantity, 0);
  const normalized = normalizeCouponCode(couponCode ?? undefined);

  const now = new Date();
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const order = await prisma.$transaction(async (tx) => {
        let couponId: string | null = null;
        let couponCodeSnapshot: string | null = null;
        let discountTotal = 0;

        if (normalized) {
          const resolved = await resolveCoupon(tx, normalized, subtotal);
          couponId = resolved.coupon.id;
          couponCodeSnapshot = resolved.coupon.code;
          discountTotal = resolved.discountTotal;

          await tx.coupon.update({
            where: { id: resolved.coupon.id },
            data: { redemptionCount: { increment: 1 } }
          });
        }

        const total = Math.max(0, subtotal - discountTotal);
        const user = await tx.user.findUnique({
          where: { id: userId },
          include: {
            addresses: {
              where: { isDefault: true },
              take: 1
            }
          }
        });
        const fallbackAddress = user?.addresses?.[0] ?? (await tx.address.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } }));
        const shippingAddressSnapshot = fallbackAddress
          ? {
              id: fallbackAddress.id,
              name: fallbackAddress.name,
              line1: fallbackAddress.line1,
              line2: fallbackAddress.line2,
              city: fallbackAddress.city,
              state: fallbackAddress.state,
              postalCode: fallbackAddress.postalCode,
              country: fallbackAddress.country,
              phone: fallbackAddress.phone
            }
          : null;
        const orderNumber = await generateNextOrderNumber(tx, now);
        const variantIds = Array.from(
          new Set(
            cart.items
              .map((item) => item.variantId)
              .filter((id): id is string => Boolean(id))
          )
        );
        const variants = variantIds.length
          ? await tx.productVariant.findMany({
              where: { id: { in: variantIds } },
              select: { id: true, attributes: true }
            })
          : [];
        const variantCostMap = new Map(variants.map((variant) => [variant.id, extractCostFromAttributes(variant.attributes)]));

        const order = await tx.order.create({
          data: {
            orderNumber,
            userId,
            total,
            discountTotal,
            couponId,
            couponCode: couponCodeSnapshot,
            customerNameSnapshot: user?.name ?? null,
            customerEmailSnapshot: user?.email ?? null,
            customerPhoneSnapshot: customerPhoneOverride?.trim() || fallbackAddress?.phone || null,
            shippingAddressSnapshot: shippingAddressSnapshot
              ? (shippingAddressSnapshot as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            items: {
              create: cart.items.map((item) => ({
                productId: item.productId,
                variantId: item.variantId,
                quantity: item.quantity,
                priceSnapshot: item.priceSnapshot,
                nameSnapshot: item.nameSnapshot,
                skuSnapshot: item.skuSnapshot,
                attributesSnapshot: normalizeAttributesSnapshot(item.attributesSnapshot, {
                  costPriceSnapshot: item.variantId ? variantCostMap.get(item.variantId) ?? 0 : 0
                })
              }))
            },
            payment: {
              create: {
                amount: total,
                status: "PENDING",
                provider: paymentProvider ?? null
              }
            }
          },
          include: { items: true, payment: true }
        });

        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

        return order;
      });
      return order;
    } catch (error) {
      const isUniqueOrderNumber =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        Array.isArray(error.meta?.target) &&
        (error.meta?.target as string[]).includes("orderNumber");
      if (!isUniqueOrderNumber || attempt === attempts) {
        throw error;
      }
    }
  }

  throw new ApiError(500, "order_number_generation_failed", "Could not generate order number");
}

export async function updateOrderStatus(orderId: string, status: "PENDING" | "PAID" | "SHIPPED" | "CANCELED") {
  return prisma.order.update({ where: { id: orderId }, data: { status } });
}
