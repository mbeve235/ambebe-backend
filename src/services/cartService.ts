import { prisma } from "../config/prisma.js";
import { Prisma } from "@prisma/client";
import { ApiError } from "../utils/apiError.js";

async function resolveCartVariant(productId: string, variantId: string | null | undefined, quantity: number) {
  if (variantId) {
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { stockItem: true }
    });
    if (!variant || variant.productId !== productId) {
      throw new ApiError(404, "not_found", "Variant not found");
    }
    const onHand = variant.stockItem?.onHand ?? 0;
    if (onHand < quantity) {
      throw new ApiError(400, "out_of_stock", "Quantidade indisponivel em estoque");
    }
    return variant;
  }

  const fallbackVariant = await prisma.productVariant.findFirst({
    where: {
      productId,
      stockItem: { is: { onHand: { gte: quantity } } }
    },
    orderBy: { createdAt: "asc" }
  });

  if (!fallbackVariant) {
    throw new ApiError(400, "out_of_stock", "Produto sem estoque");
  }

  return fallbackVariant;
}

export async function getOrCreateCart(userId: string) {
  let cart = await prisma.cart.findUnique({ where: { userId }, include: { items: true } });
  if (!cart) {
    cart = await prisma.cart.create({ data: { userId }, include: { items: true } });
  }
  return cart;
}

export async function addCartItem(userId: string, input: { productId: string; variantId?: string | null; quantity: number }) {
  const cart = await getOrCreateCart(userId);
  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) {
    throw new ApiError(404, "not_found", "Product not found");
  }
  if (product.status !== "ACTIVE") {
    throw new ApiError(400, "product_inactive", "Produto indisponivel");
  }

  const variant = await resolveCartVariant(product.id, input.variantId, input.quantity);

  const priceSnapshot = variant.price ?? product.basePrice;
  const nameSnapshot = variant.name ?? product.name;
  const skuSnapshot = variant.sku ?? product.slug;
  const attributesSnapshot = (variant.attributes ?? {}) as Prisma.InputJsonValue | Prisma.JsonNullValueInput;

  const item = await prisma.cartItem.create({
    data: {
      cartId: cart.id,
      productId: product.id,
      variantId: variant.id,
      quantity: input.quantity,
      priceSnapshot,
      nameSnapshot,
      skuSnapshot,
      attributesSnapshot
    }
  });

  return item;
}

export async function updateCartItem(userId: string, itemId: string, quantity: number) {
  const cart = await getOrCreateCart(userId);
  const item = await prisma.cartItem.findUnique({ where: { id: itemId } });
  if (!item || item.cartId !== cart.id) {
    throw new ApiError(404, "not_found", "Cart item not found");
  }

  const product = await prisma.product.findUnique({ where: { id: item.productId } });
  if (!product || product.status !== "ACTIVE") {
    throw new ApiError(400, "product_inactive", "Produto indisponivel");
  }

  const variant = await resolveCartVariant(item.productId, item.variantId, quantity);

  return prisma.cartItem.update({
    where: { id: itemId },
    data: {
      quantity,
      variantId: variant.id,
      priceSnapshot: variant.price,
      nameSnapshot: variant.name,
      skuSnapshot: variant.sku,
      attributesSnapshot: (variant.attributes ?? {}) as Prisma.InputJsonValue | Prisma.JsonNullValueInput
    }
  });
}

export async function deleteCartItem(userId: string, itemId: string) {
  const cart = await getOrCreateCart(userId);
  const item = await prisma.cartItem.findUnique({ where: { id: itemId } });
  if (!item || item.cartId !== cart.id) {
    throw new ApiError(404, "not_found", "Cart item not found");
  }

  await prisma.cartItem.delete({ where: { id: itemId } });
}
