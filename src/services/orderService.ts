import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { normalizeCouponCode, resolveCoupon } from "./couponService.js";

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

export async function checkoutCart(userId: string, couponCode?: string | null, paymentProvider?: string | null) {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: { items: true }
  });

  if (!cart || cart.items.length === 0) {
    throw new ApiError(400, "empty_cart", "Cart is empty");
  }

  const subtotal = cart.items.reduce((acc, item) => acc + Number(item.priceSnapshot) * item.quantity, 0);
  const normalized = normalizeCouponCode(couponCode ?? undefined);

  return prisma.$transaction(async (tx) => {
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

    const order = await tx.order.create({
      data: {
        userId,
        total,
        discountTotal,
        couponId,
        couponCode: couponCodeSnapshot,
        items: {
          create: cart.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            priceSnapshot: item.priceSnapshot,
            nameSnapshot: item.nameSnapshot,
            skuSnapshot: item.skuSnapshot,
            attributesSnapshot: item.attributesSnapshot
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
}

export async function updateOrderStatus(orderId: string, status: "PENDING" | "PAID" | "SHIPPED" | "CANCELED") {
  return prisma.order.update({ where: { id: orderId }, data: { status } });
}
