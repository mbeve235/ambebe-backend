import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { createProduct, updateProduct } from "../services/productService.js";
import { addImageByLink, addImageByUpload, deleteProductImage } from "../services/productImageService.js";
import { writeAuditLog } from "../services/auditLogService.js";
import {
  ensureOrderStockDeducted,
  ensureOrderStockRestored,
  shouldDeductStockForOrderState,
  shouldRestoreStockForOrderCancellation
} from "../services/orderStockService.js";

function buildVariantAttributes(attributes?: Record<string, unknown>, costPrice?: number): Prisma.InputJsonValue {
  const base = attributes ?? {};
  if (typeof costPrice === "number" && Number.isFinite(costPrice) && costPrice >= 0) {
    return { ...base, costPrice } as Prisma.InputJsonValue;
  }
  return base as Prisma.InputJsonValue;
}

export const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() })
});

export const categorySchema = z.object({
  body: z.object({
    name: z.string().min(2),
    slug: z.string().min(2),
    description: z.string().optional()
  })
});

export const updateCategorySchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().min(2).optional(),
    slug: z.string().min(2).optional(),
    description: z.string().optional()
  })
});

export const productSchema = z.object({
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

export const updateStatusSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"])
  })
});

export const categoryReplaceSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    categoryIds: z.array(z.string().uuid())
  })
});

export const productCategoryParamSchema = z.object({
  params: z.object({ id: z.string().uuid(), categoryId: z.string().uuid() })
});

export const variantSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    sku: z.string().min(2),
    name: z.string().min(2),
    price: z.number().nonnegative(),
    costPrice: z.number().nonnegative().optional(),
    attributes: z.record(z.any()).optional().default({})
  })
});

export const updateVariantSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    sku: z.string().min(2),
    name: z.string().min(2),
    price: z.number().nonnegative(),
    costPrice: z.number().nonnegative().optional(),
    attributes: z.record(z.any()).optional().default({})
  })
});

export const addImageLinkSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    url: z.string().url(),
    sortOrder: z.number().int().optional()
  })
});

export const addImageUploadSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    sortOrder: z.coerce.number().int().optional()
  })
});

export const updateImageSchema = z.object({
  params: z.object({ id: z.string().uuid(), imageId: z.string().uuid() }),
  body: z.object({
    url: z.string().url().optional(),
    sortOrder: z.number().int().optional()
  })
});

export const imageParamSchema = z.object({
  params: z.object({ id: z.string().uuid(), imageId: z.string().uuid() })
});

export const movementSchema = z.object({
  body: z.object({
    stockItemId: z.string().uuid(),
    delta: z.number().int(),
    reason: z.string().min(2)
  })
});

export const createStockItemSchema = z.object({
  body: z.object({
    variantId: z.string().uuid()
  })
});

export const updateOrderStatusSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ status: z.enum(["PENDING", "PAID", "SHIPPED", "CANCELED"]) })
});

export const updatePaymentStatusSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ paymentStatus: z.enum(["PENDING", "AUTHORIZED", "CAPTURED", "FAILED", "REFUNDED"]) })
});

export async function listCategories(_req: Request, res: Response, next: NextFunction) {
  try {
    const items = await prisma.category.findMany({ orderBy: { name: "asc" } });
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

export async function createCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const category = await prisma.category.create({ data: req.body });
    res.status(201).json(category);
  } catch (err) {
    next(err);
  }
}

export async function updateCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const category = await prisma.category.update({ where: { id: req.params.id }, data: req.body });
    res.json(category);
  } catch (err) {
    next(err);
  }
}

export async function deleteCategory(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.category.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function listProducts(_req: Request, res: Response, next: NextFunction) {
  try {
    const items = await prisma.product.findMany({
      include: { variants: true, images: true, categories: { include: { category: true } } }
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

export async function createProductHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await createProduct(req.body);
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
}

export async function getProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { variants: true, images: true, categories: { include: { category: true } } }
    });
    if (!product) throw new ApiError(404, "not_found", "Product not found");
    res.json(product);
  } catch (err) {
    next(err);
  }
}

export async function updateProductHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await updateProduct(req.params.id, req.body);
    res.json(product);
  } catch (err) {
    next(err);
  }
}

export async function updateProductStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { status: req.body.status }
    });
    res.json(product);
  } catch (err) {
    next(err);
  }
}

export async function deleteProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { status: "ARCHIVED" }
    });
    res.json(product);
  } catch (err) {
    next(err);
  }
}

export async function replaceProductCategories(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.productCategory.deleteMany({ where: { productId: req.params.id } });
      if (req.body.categoryIds.length) {
        await tx.productCategory.createMany({
          data: req.body.categoryIds.map((categoryId: string) => ({
            productId: req.params.id,
            categoryId
          }))
        });
      }
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function addProductCategory(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.productCategory.upsert({
      where: { productId_categoryId: { productId: req.params.id, categoryId: req.params.categoryId } },
      update: {},
      create: { productId: req.params.id, categoryId: req.params.categoryId }
    });
    res.status(201).send();
  } catch (err) {
    next(err);
  }
}

export async function deleteProductCategory(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.productCategory.delete({
      where: { productId_categoryId: { productId: req.params.id, categoryId: req.params.categoryId } }
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function listVariants(req: Request, res: Response, next: NextFunction) {
  try {
    const items = await prisma.productVariant.findMany({ where: { productId: req.params.id } });
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

export async function createVariant(req: Request, res: Response, next: NextFunction) {
  try {
    const variant = await prisma.productVariant.create({
      data: {
        productId: req.params.id,
        sku: req.body.sku,
        name: req.body.name,
        price: req.body.price,
        attributes: buildVariantAttributes(req.body.attributes, req.body.costPrice),
        stockItem: { create: { onHand: 0 } }
      }
    });
    res.status(201).json(variant);
  } catch (err) {
    next(err);
  }
}

export async function updateVariant(req: Request, res: Response, next: NextFunction) {
  try {
    const variant = await prisma.productVariant.update({
      where: { id: req.params.id },
      data: {
        sku: req.body.sku,
        name: req.body.name,
        price: req.body.price,
        attributes: buildVariantAttributes(req.body.attributes, req.body.costPrice)
      }
    });
    res.json(variant);
  } catch (err) {
    next(err);
  }
}

export async function deleteVariant(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.productVariant.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function addImageLink(req: Request, res: Response, next: NextFunction) {
  try {
    const image = await addImageByLink(req.params.id, req.body.url, req.body.sortOrder ?? 0);
    res.status(201).json(image);
  } catch (err) {
    next(err);
  }
}

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

export async function updateImage(req: Request, res: Response, next: NextFunction) {
  try {
    const image = await prisma.productImage.update({
      where: { id: req.params.imageId },
      data: {
        url: req.body.url,
        sortOrder: req.body.sortOrder
      }
    });
    res.json(image);
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

export async function listStockItems(req: Request, res: Response, next: NextFunction) {
  try {
    const items = await prisma.stockItem.findMany({
      where: req.query.variantId ? { variantId: String(req.query.variantId) } : {},
      include: { variant: true }
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

export async function createStockItem(req: Request, res: Response, next: NextFunction) {
  try {
    const { variantId } = req.body;
    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new ApiError(404, "not_found", "Variant not found");
    const existing = await prisma.stockItem.findUnique({ where: { variantId } });
    if (existing) return res.json(existing);
    const stock = await prisma.stockItem.create({ data: { variantId, onHand: 0 } });
    res.status(201).json(stock);
  } catch (err) {
    next(err);
  }
}

export async function getStockItem(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await prisma.stockItem.findUnique({ where: { id: req.params.id }, include: { variant: true } });
    if (!item) throw new ApiError(404, "not_found", "Stock item not found");
    res.json(item);
  } catch (err) {
    next(err);
  }
}

export async function listStockMovements(req: Request, res: Response, next: NextFunction) {
  try {
    const items = await prisma.stockMovement.findMany({
      where: { stockItemId: req.params.id },
      orderBy: { createdAt: "desc" }
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

export async function createMovement(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const stockItem = await tx.stockItem.findUnique({ where: { id: req.body.stockItemId } });
      if (!stockItem) throw new ApiError(404, "not_found", "Stock item not found");
      const movement = await tx.stockMovement.create({
        data: {
          stockItemId: stockItem.id,
          delta: req.body.delta,
          reason: req.body.reason
        }
      });
      const updated = await tx.stockItem.update({
        where: { id: stockItem.id },
        data: { onHand: stockItem.onHand + req.body.delta }
      });
      return { movement, stock: updated };
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function listOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const paymentStatus = typeof req.query.paymentStatus === "string" ? req.query.paymentStatus : undefined;
    const email = typeof req.query.email === "string" ? req.query.email.trim() : undefined;
    const orderId = typeof req.query.orderId === "string" ? req.query.orderId.trim() : undefined;
    const orderNumber = typeof req.query.orderNumber === "string" ? req.query.orderNumber.trim() : undefined;
    const name = typeof req.query.name === "string" ? req.query.name.trim() : undefined;
    const phone = typeof req.query.phone === "string" ? req.query.phone.trim() : undefined;
    const dateFromRaw = typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined;
    const dateToRaw = typeof req.query.dateTo === "string" ? req.query.dateTo : undefined;
    const minTotalRaw = typeof req.query.minTotal === "string" ? Number(req.query.minTotal) : undefined;
    const maxTotalRaw = typeof req.query.maxTotal === "string" ? Number(req.query.maxTotal) : undefined;
    const pageRaw = typeof req.query.page === "string" ? Number(req.query.page) : undefined;
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const page = Number.isFinite(pageRaw) && (pageRaw as number) > 0 ? Math.floor(pageRaw as number) : 1;
    const limit = Number.isFinite(limitRaw) && (limitRaw as number) > 0 ? Math.min(100, Math.floor(limitRaw as number)) : 20;

    const andFilters: Prisma.OrderWhereInput[] = [];
    if (status) andFilters.push({ status: status as any });
    if (paymentStatus) andFilters.push({ paymentStatus: paymentStatus as any });
    if (orderId) {
      andFilters.push({
        OR: [
          { id: { contains: orderId } },
          { orderNumber: { contains: orderId, mode: "insensitive" } }
        ]
      });
    }
    if (orderNumber) andFilters.push({ orderNumber: { contains: orderNumber, mode: "insensitive" } });
    if (email) andFilters.push({ user: { email: { contains: email, mode: "insensitive" } } });
    if (name) {
      andFilters.push({
        OR: [
          { customerNameSnapshot: { contains: name, mode: "insensitive" } },
          { user: { name: { contains: name, mode: "insensitive" } } }
        ]
      });
    }
    if (phone) {
      andFilters.push({
        OR: [
          { customerPhoneSnapshot: { contains: phone, mode: "insensitive" } },
          { user: { addresses: { some: { phone: { contains: phone, mode: "insensitive" } } } } }
        ]
      });
    }
    if (Number.isFinite(minTotalRaw)) andFilters.push({ total: { gte: minTotalRaw as number } });
    if (Number.isFinite(maxTotalRaw)) andFilters.push({ total: { lte: maxTotalRaw as number } });

    if (dateFromRaw || dateToRaw) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (dateFromRaw) {
        const dateFrom = new Date(dateFromRaw);
        if (!Number.isNaN(dateFrom.getTime())) createdAt.gte = dateFrom;
      }
      if (dateToRaw) {
        const dateTo = new Date(dateToRaw);
        if (!Number.isNaN(dateTo.getTime())) {
          dateTo.setDate(dateTo.getDate() + 1);
          createdAt.lt = dateTo;
        }
      }
      if (createdAt.gte || createdAt.lt) andFilters.push({ createdAt });
    }

    const where: Prisma.OrderWhereInput = andFilters.length ? { AND: andFilters } : {};

    const [items, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        include: {
          items: true,
          payment: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true
            }
          }
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.order.count({ where })
    ]);
    res.json({ items, page, limit, total });
  } catch (err) {
    next(err);
  }
}

export async function getOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        items: true,
        payment: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
            addresses: {
              select: {
                id: true,
                userId: true,
                name: true,
                line1: true,
                line2: true,
                city: true,
                state: true,
                postalCode: true,
                country: true,
                phone: true,
                isDefault: true,
                createdAt: true,
                updatedAt: true
              },
              orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }]
            }
          }
        }
      }
    });
    if (!order) throw new ApiError(404, "not_found", "Order not found");

    const historyRaw = await prisma.auditLog.findMany({
      where: {
        entity: "order",
        entityId: order.id,
        action: { in: ["order.status_changed", "order.payment_status_changed"] }
      },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 50
    });

    const statusHistory = historyRaw.map((log) => {
      const meta =
        log.meta && typeof log.meta === "object" && !Array.isArray(log.meta)
          ? (log.meta as Record<string, unknown>)
          : {};
      return {
        id: log.id,
        type: log.action,
        from: typeof meta.from === "string" ? meta.from : null,
        to: typeof meta.to === "string" ? meta.to : null,
        createdAt: log.createdAt,
        actor: log.actor ?? null
      };
    });

    res.json({ ...order, statusHistory });
  } catch (err) {
    next(err);
  }
}

export async function listOrderItems(req: Request, res: Response, next: NextFunction) {
  try {
    const items = await prisma.orderItem.findMany({ where: { orderId: req.params.id } });
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

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
    await writeAuditLog(req.user?.id ?? null, "order.status_changed", "order", order.id, {
      from: previousOrder.status,
      to: order.status,
      paymentStatus: order.paymentStatus
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

export async function updateOrderPaymentStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const previous = await prisma.order.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, paymentStatus: true }
    });
    if (!previous) throw new ApiError(404, "not_found", "Order not found");

    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { paymentStatus: req.body.paymentStatus }
    });
    await prisma.payment.updateMany({
      where: { orderId: order.id },
      data: { status: req.body.paymentStatus }
    });
    if (shouldDeductStockForOrderState(order.status, order.paymentStatus)) {
      await ensureOrderStockDeducted(order.id);
    }
    await writeAuditLog(req.user?.id ?? null, "order.payment_status_changed", "order", order.id, {
      from: previous.paymentStatus,
      to: order.paymentStatus,
      status: order.status
    });
    res.json(order);
  } catch (err) {
    next(err);
  }
}

export async function listPayments(_req: Request, res: Response, next: NextFunction) {
  try {
    const items = await prisma.payment.findMany({ include: { order: true } });
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

export async function getPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { order: true } });
    if (!payment) throw new ApiError(404, "not_found", "Payment not found");
    res.json(payment);
  } catch (err) {
    next(err);
  }
}
