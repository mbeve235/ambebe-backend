import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { createProduct, updateProduct } from "../services/productService.js";
import { addImageByLink, addImageByUpload, deleteProductImage } from "../services/productImageService.js";
import { adjustStock } from "../services/stockService.js";
import {
  ensureOrderStockDeducted,
  ensureOrderStockRestored,
  shouldDeductStockForOrderState,
  shouldRestoreStockForOrderCancellation
} from "../services/orderStockService.js";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";

export const createProductSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    slug: z.string().min(2),
    description: z.string().optional(),
    basePrice: z.number().nonnegative(),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).default("DRAFT"),
    categoryIds: z.array(z.string().uuid()).optional(),
    variants: z.array(
      z.object({
        sku: z.string().min(2),
        name: z.string().min(2),
        price: z.number().nonnegative(),
        costPrice: z.number().nonnegative().optional(),
        attributes: z.record(z.any()).optional().default({})
      })
    )
  })
});

export async function createProductHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await createProduct(req.body);
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
}

export const updateProductSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().min(2).optional(),
    slug: z.string().min(2).optional(),
    description: z.string().optional(),
    basePrice: z.number().nonnegative().optional(),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
    categoryIds: z.array(z.string().uuid()).optional()
  })
});

export async function updateProductHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await updateProduct(req.params.id, req.body);
    res.json(product);
  } catch (err) {
    next(err);
  }
}

export async function listProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const products = await prisma.product.findMany({
      include: { variants: true, images: true, categories: { include: { category: true } } }
    });
    res.json({ items: products });
  } catch (err) {
    next(err);
  }
}

export const addImageLinkSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    url: z.string().url(),
    sortOrder: z.number().int().optional()
  })
});

export async function addImageLink(req: Request, res: Response, next: NextFunction) {
  try {
    const image = await addImageByLink(req.params.id, req.body.url, req.body.sortOrder ?? 0);
    res.status(201).json(image);
  } catch (err) {
    next(err);
  }
}

export const addImageUploadSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    sortOrder: z.coerce.number().int().optional()
  })
});

export async function addImageUpload(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw new ApiError(400, "missing_file", "File is required");
    }
    const image = await addImageByUpload(req.params.id, req.file, req.body.sortOrder ?? 0);
    res.status(201).json(image);
  } catch (err) {
    next(err);
  }
}

export async function deleteImage(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteProductImage(req.params.id, req.params.imageId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export const deleteImageSchema = z.object({
  params: z.object({ id: z.string().uuid(), imageId: z.string().uuid() })
});

export const adjustStockSchema = z.object({
  body: z.object({
    variantId: z.string().uuid(),
    delta: z.number().int(),
    reason: z.string().min(2)
  })
});

export async function adjustStockHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adjustStock(req.body.variantId, req.body.delta, req.body.reason);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function listOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const paymentStatus = typeof req.query.paymentStatus === "string" ? req.query.paymentStatus : undefined;
    const email = typeof req.query.email === "string" ? req.query.email.trim() : undefined;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (email) {
      where.user = { email: { contains: email } };
    }

    const orders = await prisma.order.findMany({
      where,
      include: { items: true, payment: true, user: true },
      orderBy: { createdAt: "desc" }
    });
    res.json({ items: orders });
  } catch (err) {
    next(err);
  }
}

export const updateOrderStatusSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ status: z.enum(["PENDING", "PAID", "SHIPPED", "CANCELED"]) })
});

export async function updateOrderStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const previousOrder = await prisma.order.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, paymentStatus: true }
    });
    if (!previousOrder) throw new ApiError(404, "not_found", "Order not found");

    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { status: req.body.status }
    });
    if (shouldDeductStockForOrderState(order.status, order.paymentStatus)) {
      await ensureOrderStockDeducted(order.id);
    }
    if (shouldRestoreStockForOrderCancellation(previousOrder.status, previousOrder.paymentStatus, order.status)) {
      await ensureOrderStockRestored(order.id);
    }
    res.json(order);
  } catch (err) {
    next(err);
  }
}
