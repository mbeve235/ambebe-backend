import { prisma } from "../config/prisma.js";
import { Prisma } from "@prisma/client";
import { ApiError } from "../utils/apiError.js";

function withCostPrice(attributes: Record<string, unknown> | undefined, costPrice?: number) {
  const base = attributes ?? {};
  if (typeof costPrice === "number" && Number.isFinite(costPrice) && costPrice >= 0) {
    return { ...base, costPrice };
  }
  return base;
}

export async function createProduct(input: {
  name: string;
  slug: string;
  description?: string | null;
  basePrice: number;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  categoryIds?: string[];
  variants: Array<{ sku: string; name: string; price: number; attributes?: Record<string, unknown>; costPrice?: number }>;
}) {
  const product = await prisma.product.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description,
      basePrice: input.basePrice,
      status: input.status,
      categories: input.categoryIds?.length
        ? {
            create: input.categoryIds.map((categoryId) => ({ categoryId }))
          }
        : undefined,
      variants: {
        create: input.variants.map((variant) => ({
          sku: variant.sku,
          name: variant.name,
          price: variant.price,
          attributes: withCostPrice(variant.attributes, variant.costPrice) as Prisma.InputJsonValue,
          stockItem: { create: { onHand: 0 } }
        }))
      }
    },
    include: { variants: true, categories: true }
  });

  return product;
}

export async function updateProduct(id: string, input: {
  name?: string;
  slug?: string;
  description?: string | null;
  basePrice?: number;
  status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
  categoryIds?: string[];
}) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    throw new ApiError(404, "not_found", "Product not found");
  }

  const product = await prisma.product.update({
    where: { id },
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description,
      basePrice: input.basePrice,
      status: input.status,
      categories: input.categoryIds
        ? {
            deleteMany: {},
            create: input.categoryIds.map((categoryId) => ({ categoryId }))
          }
        : undefined
    }
  });

  return product;
}
