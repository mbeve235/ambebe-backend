import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";

export const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() })
});

export const slugParamSchema = z.object({
  params: z.object({ slug: z.string().min(2) })
});

export const listProductsSchema = z.object({
  query: z.object({
    q: z.string().optional(),
    categoryId: z.string().uuid().optional(),
    minPrice: z.coerce.number().optional(),
    maxPrice: z.coerce.number().optional(),
    sort: z.enum(["price_asc", "price_desc", "newest"]).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional()
  })
});

export async function listCategories(_req: Request, res: Response, next: NextFunction) {
  try {
    const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
    res.json({ items: categories });
  } catch (err) {
    next(err);
  }
}

export async function getCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const category = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!category) {
      throw new ApiError(404, "not_found", "Category not found");
    }
    res.json(category);
  } catch (err) {
    next(err);
  }
}

export async function listCategoryProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const products = await prisma.product.findMany({
      where: {
        status: "ACTIVE",
        categories: { some: { categoryId: req.params.id } }
      },
      include: { images: true, variants: true, categories: { include: { category: true } } }
    });
    res.json({ items: products });
  } catch (err) {
    next(err);
  }
}

export async function listProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const { q, categoryId, minPrice, maxPrice, sort, page = 1, limit = 20 } = req.query as {
      q?: string;
      categoryId?: string;
      minPrice?: number;
      maxPrice?: number;
      sort?: "price_asc" | "price_desc" | "newest";
      page?: number;
      limit?: number;
    };

    const where: any = { status: "ACTIVE" };
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { description: { contains: q } }
      ];
    }
    if (categoryId) {
      where.categories = { some: { categoryId } };
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.basePrice = {};
      if (minPrice !== undefined) where.basePrice.gte = minPrice;
      if (maxPrice !== undefined) where.basePrice.lte = maxPrice;
    }

    const orderBy =
      sort === "price_asc"
        ? { basePrice: "asc" }
        : sort === "price_desc"
          ? { basePrice: "desc" }
          : { createdAt: "desc" };

    const skip = (page - 1) * limit;
    const [items, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: { images: true, variants: true, categories: { include: { category: true } } },
        orderBy,
        skip,
        take: limit
      }),
      prisma.product.count({ where })
    ]);

    res.json({ items, page, limit, total });
  } catch (err) {
    next(err);
  }
}

export async function getProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, status: "ACTIVE" },
      include: { images: true, variants: true, categories: { include: { category: true } } }
    });
    if (!product) {
      throw new ApiError(404, "not_found", "Product not found");
    }
    res.json(product);
  } catch (err) {
    next(err);
  }
}

export async function getProductBySlug(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await prisma.product.findFirst({
      where: { slug: req.params.slug, status: "ACTIVE" },
      include: { images: true, variants: true, categories: { include: { category: true } } }
    });
    if (!product) {
      throw new ApiError(404, "not_found", "Product not found");
    }
    res.json(product);
  } catch (err) {
    next(err);
  }
}

export async function listProductVariants(req: Request, res: Response, next: NextFunction) {
  try {
    const variants = await prisma.productVariant.findMany({
      where: { productId: req.params.id }
    });
    res.json({ items: variants });
  } catch (err) {
    next(err);
  }
}

export async function getVariant(req: Request, res: Response, next: NextFunction) {
  try {
    const variant = await prisma.productVariant.findUnique({ where: { id: req.params.id } });
    if (!variant) {
      throw new ApiError(404, "not_found", "Variant not found");
    }
    res.json(variant);
  } catch (err) {
    next(err);
  }
}

export async function listProductImages(req: Request, res: Response, next: NextFunction) {
  try {
    const images = await prisma.productImage.findMany({
      where: { productId: req.params.id },
      orderBy: { sortOrder: "asc" }
    });
    res.json({ items: images });
  } catch (err) {
    next(err);
  }
}

export async function getVariantAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const stock = await prisma.stockItem.findUnique({ where: { variantId: req.params.id } });
    const onHand = stock?.onHand ?? 0;
    res.json({ inStock: onHand > 0, onHand });
  } catch (err) {
    next(err);
  }
}
