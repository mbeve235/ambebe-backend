import { PrismaClient } from "@prisma/client";
import { ApiError } from "../utils/apiError.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

type CouponResolution = {
  coupon: {
    id: string;
    code: string;
    type: "PERCENT" | "FIXED";
    value: number;
    minSubtotal?: number | null;
    maxRedemptions?: number | null;
    redemptionCount: number;
    startsAt?: Date | null;
    endsAt?: Date | null;
    isActive: boolean;
  };
  discountTotal: number;
};

export async function resolveCoupon(client: DbClient, code: string, subtotal: number): Promise<CouponResolution> {
  const normalized = normalizeCode(code);
  const coupon = await client.coupon.findUnique({ where: { code: normalized } });
  if (!coupon) {
    throw new ApiError(400, "coupon_invalid", "Cupom invalido");
  }

  if (!coupon.isActive) {
    throw new ApiError(400, "coupon_inactive", "Cupom indisponivel");
  }

  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) {
    throw new ApiError(400, "coupon_not_started", "Cupom ainda nao esta ativo");
  }

  if (coupon.endsAt && coupon.endsAt < now) {
    throw new ApiError(400, "coupon_expired", "Cupom expirado");
  }

  const minSubtotal = coupon.minSubtotal ? Number(coupon.minSubtotal) : null;
  if (minSubtotal !== null && subtotal < minSubtotal) {
    throw new ApiError(400, "coupon_min_subtotal", "Subtotal abaixo do minimo do cupom");
  }

  if (coupon.maxRedemptions !== null && coupon.maxRedemptions !== undefined) {
    if (coupon.redemptionCount >= coupon.maxRedemptions) {
      throw new ApiError(400, "coupon_limit_reached", "Cupom atingiu o limite de uso");
    }
  }

  const value = Number(coupon.value);
  let discountTotal = 0;
  if (coupon.type === "PERCENT") {
    discountTotal = subtotal * (value / 100);
  } else {
    discountTotal = value;
  }

  if (Number.isNaN(discountTotal) || discountTotal <= 0) {
    throw new ApiError(400, "coupon_invalid_value", "Cupom invalido");
  }

  discountTotal = Math.min(discountTotal, subtotal);

  return {
    coupon: {
      id: coupon.id,
      code: coupon.code,
      type: coupon.type,
      value,
      minSubtotal,
      maxRedemptions: coupon.maxRedemptions,
      redemptionCount: coupon.redemptionCount,
      startsAt: coupon.startsAt,
      endsAt: coupon.endsAt,
      isActive: coupon.isActive
    },
    discountTotal
  };
}

export function normalizeCouponCode(code: string | undefined | null) {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  return normalized ? normalized : null;
}
