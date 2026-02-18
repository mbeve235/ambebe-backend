import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";

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

  let variant = null;
  if (input.variantId) {
    variant = await prisma.productVariant.findUnique({ where: { id: input.variantId } });
    if (!variant) {
      throw new ApiError(404, "not_found", "Variant not found");
    }
  }

  const priceSnapshot = variant ? variant.price : product.basePrice;
  const nameSnapshot = variant ? variant.name : product.name;
  const skuSnapshot = variant ? variant.sku : product.slug;
  const attributesSnapshot = variant ? variant.attributes : {};

  const item = await prisma.cartItem.create({
    data: {
      cartId: cart.id,
      productId: product.id,
      variantId: variant?.id,
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

  return prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
}

export async function deleteCartItem(userId: string, itemId: string) {
  const cart = await getOrCreateCart(userId);
  const item = await prisma.cartItem.findUnique({ where: { id: itemId } });
  if (!item || item.cartId !== cart.id) {
    throw new ApiError(404, "not_found", "Cart item not found");
  }

  await prisma.cartItem.delete({ where: { id: itemId } });
}
