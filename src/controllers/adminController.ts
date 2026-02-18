import { Request, Response, NextFunction } from "express";
import { ProductStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";
import { ApiError } from "../utils/apiError.js";
import { hashPassword } from "../utils/password.js";
import { sendSupportReplyEmail } from "../services/mailService.js";
import { adjustStock } from "../services/stockService.js";

export const createUserSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(2).max(120).optional(),
    role: z.enum(["customer", "manager", "admin"]).optional()
  })
});

export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password, name, role } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ApiError(409, "email_taken", "Email already registered");
    }

    const roleName = role ?? "customer";
    const roleRecord = await prisma.role.findUnique({ where: { name: roleName } });
    if (!roleRecord) {
      throw new ApiError(400, "invalid_role", "Role not found");
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash, name, roleId: roleRecord.id },
      include: { role: true }
    });
    res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role.name });
  } catch (err) {
    next(err);
  }
}

export const updateUserPasswordSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ newPassword: z.string().min(8) })
});

export async function updateUserPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const passwordHash = await hashPassword(req.body.newPassword);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash }
    });
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function listUsers(_req: Request, res: Response, next: NextFunction) {
  try {
    const users = await prisma.user.findMany({ include: { role: true } });
    res.json({ items: users });
  } catch (err) {
    next(err);
  }
}

export const userIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid() })
});

export async function getUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { role: true } });
    if (!user) {
      throw new ApiError(404, "not_found", "User not found");
    }
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      throw new ApiError(404, "not_found", "User not found");
    }
    await prisma.user.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export const updateUserRoleSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ roleId: z.string().uuid() })
});

export async function updateUserRole(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { roleId: req.body.roleId }
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function listRoles(_req: Request, res: Response, next: NextFunction) {
  try {
    const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } } } });
    res.json({ items: roles });
  } catch (err) {
    next(err);
  }
}

export const createRoleSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    permissionIds: z.array(z.string().uuid()).optional()
  })
});

export async function createRole(req: Request, res: Response, next: NextFunction) {
  try {
    const role = await prisma.role.create({ data: { name: req.body.name } });
    if (req.body.permissionIds?.length) {
      await prisma.rolePermission.createMany({
        data: req.body.permissionIds.map((permissionId: string) => ({
          roleId: role.id,
          permissionId
        }))
      });
    }
    res.status(201).json(role);
  } catch (err) {
    next(err);
  }
}

export const updateRoleSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ name: z.string().min(2) })
});

export async function updateRole(req: Request, res: Response, next: NextFunction) {
  try {
    const role = await prisma.role.update({ where: { id: req.params.id }, data: { name: req.body.name } });
    res.json(role);
  } catch (err) {
    next(err);
  }
}

export async function deleteRole(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.role.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function listPermissions(_req: Request, res: Response, next: NextFunction) {
  try {
    const permissions = await prisma.permission.findMany();
    res.json({ items: permissions });
  } catch (err) {
    next(err);
  }
}

export const createPermissionSchema = z.object({
  body: z.object({
    code: z.string().min(2),
    description: z.string().optional()
  })
});

export async function createPermission(req: Request, res: Response, next: NextFunction) {
  try {
    const permission = await prisma.permission.create({ data: req.body });
    res.status(201).json(permission);
  } catch (err) {
    next(err);
  }
}

export const updatePermissionSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    code: z.string().min(2).optional(),
    description: z.string().optional()
  })
});

export async function updatePermission(req: Request, res: Response, next: NextFunction) {
  try {
    const permission = await prisma.permission.update({ where: { id: req.params.id }, data: req.body });
    res.json(permission);
  } catch (err) {
    next(err);
  }
}

export async function deletePermission(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.permission.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export const rolePermissionSchema = z.object({
  params: z.object({ id: z.string().uuid(), permissionId: z.string().uuid() })
});

export const replaceRolePermissionsSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ permissionIds: z.array(z.string().uuid()) })
});

export async function listRolePermissions(req: Request, res: Response, next: NextFunction) {
  try {
    const role = await prisma.role.findUnique({
      where: { id: req.params.id },
      include: { permissions: { include: { permission: true } } }
    });
    if (!role) throw new ApiError(404, "not_found", "Role not found");
    res.json({ items: role.permissions.map((rp) => rp.permission) });
  } catch (err) {
    next(err);
  }
}

export async function replaceRolePermissions(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: req.params.id } });
      if (req.body.permissionIds.length) {
        await tx.rolePermission.createMany({
          data: req.body.permissionIds.map((permissionId: string) => ({
            roleId: req.params.id,
            permissionId
          }))
        });
      }
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function addRolePermission(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: req.params.id, permissionId: req.params.permissionId }
      },
      update: {},
      create: { roleId: req.params.id, permissionId: req.params.permissionId }
    });
    res.status(201).send();
  } catch (err) {
    next(err);
  }
}

export async function deleteRolePermission(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: { roleId: req.params.id, permissionId: req.params.permissionId }
      }
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function listAuditLogs(_req: Request, res: Response, next: NextFunction) {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { id: true, email: true, name: true } } }
    });
    res.json({ items: logs });
  } catch (err) {
    next(err);
  }
}

export async function getAuditLog(req: Request, res: Response, next: NextFunction) {
  try {
    const log = await prisma.auditLog.findUnique({
      where: { id: req.params.id },
      include: { actor: { select: { id: true, email: true, name: true } } }
    });
    if (!log) throw new ApiError(404, "not_found", "Audit log not found");
    res.json(log);
  } catch (err) {
    next(err);
  }
}

export const undoAuditLogSchema = z.object({
  params: z.object({ id: z.string().uuid() })
});

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toNumber = (value: unknown) => {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const toDate = (value: unknown) => {
  if (!value) return undefined;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const normalizePath = (path: string) => path.replace(/^\/v1/, "");

async function undoAuditAction(log: { meta: unknown; entityId: string | null }) {
  if (!isPlainObject(log.meta)) {
    throw new ApiError(400, "undo_not_supported", "Audit log sem detalhes suficientes");
  }

  const method = String(log.meta.method ?? "");
  const path = String(log.meta.path ?? "");
  const body = isPlainObject(log.meta.body) ? log.meta.body : {};
  const prev = isPlainObject(log.meta.prev) ? log.meta.prev : {};

  const normalized = normalizePath(path);

  if (method === "POST" && normalized.endsWith("/products")) {
    const slug = body.slug ? String(body.slug) : null;
    if (!slug) {
      throw new ApiError(400, "undo_not_supported", "Slug ausente para desfazer criacao");
    }
    const product = await prisma.product.findUnique({ where: { slug } });
    if (!product) {
      throw new ApiError(404, "not_found", "Product not found");
    }
    await prisma.product.update({ where: { id: product.id }, data: { status: "ARCHIVED" } });
    return { action: "archive_product", entityId: product.id };
  }

  if (normalized.match(/\/products\/[^/]+$/)) {
    const productPrev = isPlainObject(prev.product) ? prev.product : null;
    if (!productPrev) {
      throw new ApiError(400, "undo_not_supported", "Estado anterior do produto ausente");
    }

    if (method === "DELETE") {
      await prisma.product.update({
        where: { id: productPrev.id as string },
        data: { status: (productPrev.status as ProductStatus) ?? ProductStatus.ACTIVE }
      });
      return { action: "restore_product_status", entityId: productPrev.id as string };
    }

    if (method === "PUT" || method === "PATCH") {
      const categoryIds = Array.isArray(productPrev.categoryIds) ? productPrev.categoryIds : [];
      await prisma.product.update({
        where: { id: productPrev.id as string },
        data: {
          name: productPrev.name as string,
          slug: productPrev.slug as string,
          description: (productPrev.description as string | null) ?? null,
          basePrice: toNumber(productPrev.basePrice) ?? 0,
          status: productPrev.status as any,
          categories: {
            deleteMany: {},
            create: categoryIds.map((categoryId) => ({ categoryId: String(categoryId) }))
          }
        }
      });
      return { action: "restore_product", entityId: productPrev.id as string };
    }
  }

  if (normalized.match(/\/products\/[^/]+\/status$/) && method === "PATCH") {
    const productPrev = isPlainObject(prev.product) ? prev.product : null;
    if (!productPrev) {
      throw new ApiError(400, "undo_not_supported", "Estado anterior do produto ausente");
    }
    await prisma.product.update({
      where: { id: productPrev.id as string },
      data: { status: productPrev.status as any }
    });
    return { action: "restore_product_status", entityId: productPrev.id as string };
  }

  if (method === "POST" && normalized.endsWith("/coupons")) {
    const code = body.code ? String(body.code).trim().toUpperCase() : null;
    if (!code) {
      throw new ApiError(400, "undo_not_supported", "Codigo ausente para desfazer criacao");
    }
    const coupon = await prisma.coupon.findUnique({ where: { code } });
    if (!coupon) {
      throw new ApiError(404, "not_found", "Coupon not found");
    }
    await prisma.coupon.delete({ where: { id: coupon.id } });
    return { action: "delete_coupon", entityId: coupon.id };
  }

  if (normalized.match(/\/coupons\/[^/]+$/)) {
    const couponPrev = isPlainObject(prev.coupon) ? prev.coupon : null;
    if (!couponPrev) {
      throw new ApiError(400, "undo_not_supported", "Estado anterior do cupom ausente");
    }

    if (method === "PUT") {
      await prisma.coupon.update({
        where: { id: couponPrev.id as string },
        data: {
          code: String(couponPrev.code),
          description: (couponPrev.description as string | null) ?? null,
          type: couponPrev.type as any,
          value: toNumber(couponPrev.value) ?? 0,
          minSubtotal: couponPrev.minSubtotal === null ? null : toNumber(couponPrev.minSubtotal),
          maxRedemptions: couponPrev.maxRedemptions === null ? null : Number(couponPrev.maxRedemptions),
          redemptionCount: Number(couponPrev.redemptionCount ?? 0),
          startsAt: toDate(couponPrev.startsAt) ?? null,
          endsAt: toDate(couponPrev.endsAt) ?? null,
          isActive: Boolean(couponPrev.isActive)
        }
      });
      return { action: "restore_coupon", entityId: couponPrev.id as string };
    }

    if (method === "DELETE") {
      await prisma.coupon.create({
        data: {
          id: String(couponPrev.id),
          code: String(couponPrev.code),
          description: (couponPrev.description as string | null) ?? null,
          type: couponPrev.type as any,
          value: toNumber(couponPrev.value) ?? 0,
          minSubtotal: couponPrev.minSubtotal === null ? null : toNumber(couponPrev.minSubtotal),
          maxRedemptions: couponPrev.maxRedemptions === null ? null : Number(couponPrev.maxRedemptions),
          redemptionCount: Number(couponPrev.redemptionCount ?? 0),
          startsAt: toDate(couponPrev.startsAt),
          endsAt: toDate(couponPrev.endsAt),
          isActive: Boolean(couponPrev.isActive)
        }
      });
      return { action: "restore_coupon", entityId: couponPrev.id as string };
    }
  }

  if (normalized.endsWith("/stock/adjust") && method === "POST") {
    const variantId = body.variantId ? String(body.variantId) : null;
    const delta = toNumber(body.delta);
    if (!variantId || delta === undefined) {
      throw new ApiError(400, "undo_not_supported", "Dados insuficientes para desfazer ajuste de stock");
    }
    await adjustStock(variantId, -delta, `UNDO: ${body.reason ?? "ajuste"}`);
    return { action: "reverse_stock_adjust", entityId: variantId };
  }

  if (normalized.endsWith("/inventory/movements") && method === "POST") {
    const stockItemId = body.stockItemId ? String(body.stockItemId) : null;
    const delta = toNumber(body.delta);
    if (!stockItemId || delta === undefined) {
      throw new ApiError(400, "undo_not_supported", "Dados insuficientes para desfazer movimento");
    }
    await prisma.$transaction(async (tx) => {
      const item = await tx.stockItem.findUnique({ where: { id: stockItemId } });
      if (!item) {
        throw new ApiError(404, "not_found", "Stock item not found");
      }
      await tx.stockMovement.create({
        data: {
          stockItemId: item.id,
          delta: -delta,
          reason: `UNDO: ${body.reason ?? "movimento"}`
        }
      });
      await tx.stockItem.update({
        where: { id: item.id },
        data: { onHand: { increment: -delta } }
      });
    });
    return { action: "reverse_stock_movement", entityId: stockItemId };
  }

  if (normalized.match(/\/orders\/[^/]+\/status$/) && method === "PATCH") {
    const orderPrev = isPlainObject(prev.order) ? prev.order : null;
    if (!orderPrev) {
      throw new ApiError(400, "undo_not_supported", "Estado anterior do pedido ausente");
    }
    await prisma.order.update({
      where: { id: orderPrev.id as string },
      data: {
        status: orderPrev.status as any,
        paymentStatus: orderPrev.paymentStatus as any
      }
    });
    return { action: "restore_order_status", entityId: orderPrev.id as string };
  }

  if (normalized.match(/\/orders\/[^/]+\/payment-status$/) && method === "PATCH") {
    const orderPrev = isPlainObject(prev.order) ? prev.order : null;
    if (!orderPrev) {
      throw new ApiError(400, "undo_not_supported", "Estado anterior do pedido ausente");
    }
    await prisma.order.update({
      where: { id: orderPrev.id as string },
      data: { paymentStatus: orderPrev.paymentStatus as any }
    });
    return { action: "restore_payment_status", entityId: orderPrev.id as string };
  }

  throw new ApiError(400, "undo_not_supported", "Nao e possivel desfazer esta acao");
}

export async function undoAuditLog(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const log = await prisma.auditLog.findUnique({ where: { id: req.params.id } });
    if (!log) throw new ApiError(404, "not_found", "Audit log not found");

    if (isPlainObject(log.meta) && isPlainObject(log.meta.undo) && log.meta.undo.status === "done") {
      throw new ApiError(409, "undo_already_done", "Acao ja foi desfeita");
    }

    const result = await undoAuditAction({ meta: log.meta, entityId: log.entityId });

    const meta = isPlainObject(log.meta) ? log.meta : {};
    meta.undo = {
      status: "done",
      actorId: req.user.id,
      at: new Date().toISOString(),
      action: result.action,
      entityId: result.entityId
    };

    await prisma.auditLog.update({
      where: { id: log.id },
      data: { meta }
    });

    res.json({ status: "ok", ...result });
  } catch (err) {
    next(err);
  }
}

export const listIdempotencyKeysSchema = z.object({
  query: z.object({
    userId: z.string().uuid().optional(),
    key: z.string().optional()
  })
});

export async function listIdempotencyKeys(req: Request, res: Response, next: NextFunction) {
  try {
    const where: any = {};
    if (req.query.userId) where.userId = String(req.query.userId);
    if (req.query.key) where.key = String(req.query.key);
    const items = await prisma.idempotencyKey.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

export async function getIdempotencyKey(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await prisma.idempotencyKey.findUnique({ where: { id: req.params.id } });
    if (!item) throw new ApiError(404, "not_found", "Idempotency key not found");
    res.json(item);
  } catch (err) {
    next(err);
  }
}

const supportStatusSchema = z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]);

export const supportMessageListSchema = z.object({
  query: z.object({
    status: supportStatusSchema.optional(),
    isRead: z.enum(["true", "false"]).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional()
  })
});

export const supportMessageIdSchema = z.object({
  params: z.object({ id: z.string().uuid() })
});

export const supportMessageUpdateSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      status: supportStatusSchema.optional(),
      isRead: z.boolean().optional()
    })
    .refine((data) => Object.keys(data).length > 0, { message: "Nenhuma alteracao enviada" })
});

export const supportReplySchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    message: z.string().trim().min(5).max(3000)
  })
});

export async function listSupportMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.isRead !== undefined) where.isRead = req.query.isRead === "true";

    const [items, total] = await prisma.$transaction([
      prisma.supportMessage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, email: true, name: true } },
          replies: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { id: true, email: true, name: true } } }
          }
        }
      }),
      prisma.supportMessage.count({ where })
    ]);

    res.json({ items, page, limit, total });
  } catch (err) {
    next(err);
  }
}

export async function getSupportMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const message = await prisma.supportMessage.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, email: true, name: true } },
        replies: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, email: true, name: true } } }
        }
      }
    });
    if (!message) throw new ApiError(404, "not_found", "Support message not found");
    res.json(message);
  } catch (err) {
    next(err);
  }
}

export async function updateSupportMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const updateData: Record<string, unknown> = {};
    if (req.body.status) updateData.status = req.body.status;
    if (req.body.isRead !== undefined) updateData.isRead = req.body.isRead;

    if (req.body.status === "RESOLVED" && req.body.isRead === undefined) {
      updateData.isRead = true;
    }

    const updated = await prisma.supportMessage.update({
      where: { id: req.params.id },
      data: updateData
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function createSupportReply(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new ApiError(401, "unauthorized", "Not authenticated");
    const supportMessage = await prisma.supportMessage.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { id: true, email: true, name: true } } }
    });
    if (!supportMessage) {
      throw new ApiError(404, "not_found", "Support message not found");
    }

    const reply = await prisma.supportReply.create({
      data: {
        supportMessageId: supportMessage.id,
        authorId: req.user.id,
        message: req.body.message
      },
      include: { author: { select: { id: true, email: true, name: true } } }
    });

    const updateData: Record<string, unknown> = { isRead: true };
    if (supportMessage.status === "OPEN") {
      updateData.status = "IN_PROGRESS";
    }

    await prisma.supportMessage.update({
      where: { id: supportMessage.id },
      data: updateData
    });

    try {
      await sendSupportReplyEmail({
        userEmail: supportMessage.user.email,
        userName: supportMessage.user.name,
        subject: supportMessage.subject,
        reply: reply.message
      });
    } catch (error) {
      logger.warn({ err: error, messageId: supportMessage.id }, "Support reply email failed");
    }

    res.status(201).json(reply);
  } catch (err) {
    next(err);
  }
}

const couponTypeSchema = z.enum(["PERCENT", "FIXED"]);

const couponBaseSchema = z.object({
  code: z.string().min(3).max(50),
  description: z.string().max(255).optional(),
  type: couponTypeSchema,
  value: z.coerce.number().positive(),
  minSubtotal: z.coerce.number().min(0).optional(),
  maxRedemptions: z.coerce.number().int().positive().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  isActive: z.boolean().optional()
});

export const createCouponSchema = z.object({
  body: couponBaseSchema
});

export const updateCouponSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: couponBaseSchema.partial()
});

const normalizeCouponCode = (code: string) => code.trim().toUpperCase();

const parseOptionalDate = (value?: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, "invalid_date", "Data invalida");
  }
  return date;
};

const validateCouponInput = (data: {
  type?: "PERCENT" | "FIXED";
  value?: number;
  startsAt?: Date;
  endsAt?: Date;
}) => {
  if (data.type === "PERCENT" && typeof data.value === "number" && data.value > 100) {
    throw new ApiError(400, "coupon_value_invalid", "Percentual acima de 100");
  }
  if (data.startsAt && data.endsAt && data.endsAt < data.startsAt) {
    throw new ApiError(400, "coupon_dates_invalid", "Periodo do cupom invalido");
  }
};

export async function listCoupons(_req: Request, res: Response, next: NextFunction) {
  try {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
    res.json({ items: coupons });
  } catch (err) {
    next(err);
  }
}

export async function getCoupon(req: Request, res: Response, next: NextFunction) {
  try {
    const coupon = await prisma.coupon.findUnique({ where: { id: req.params.id } });
    if (!coupon) throw new ApiError(404, "not_found", "Coupon not found");
    res.json(coupon);
  } catch (err) {
    next(err);
  }
}

export async function createCoupon(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = req.body;
    const startsAt = parseOptionalDate(payload.startsAt);
    const endsAt = parseOptionalDate(payload.endsAt);
    validateCouponInput({ type: payload.type, value: payload.value, startsAt, endsAt });

    const coupon = await prisma.coupon.create({
      data: {
        code: normalizeCouponCode(payload.code),
        description: payload.description,
        type: payload.type,
        value: payload.value,
        minSubtotal: payload.minSubtotal,
        maxRedemptions: payload.maxRedemptions,
        startsAt,
        endsAt,
        isActive: payload.isActive ?? true
      }
    });
    res.status(201).json(coupon);
  } catch (err) {
    next(err);
  }
}

export async function updateCoupon(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.body || !Object.keys(req.body).length) {
      throw new ApiError(400, "empty_payload", "Nenhuma alteracao enviada");
    }

    const existing = await prisma.coupon.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      throw new ApiError(404, "not_found", "Coupon not found");
    }

    const data: Record<string, unknown> = {};
    if (req.body.code) data.code = normalizeCouponCode(req.body.code);
    if (req.body.description !== undefined) data.description = req.body.description || null;
    if (req.body.type) data.type = req.body.type;
    if (req.body.value !== undefined) data.value = req.body.value;
    if (req.body.minSubtotal !== undefined) data.minSubtotal = req.body.minSubtotal;
    if (req.body.maxRedemptions !== undefined) data.maxRedemptions = req.body.maxRedemptions;
    if (req.body.isActive !== undefined) data.isActive = req.body.isActive;

    const startsAt = parseOptionalDate(req.body.startsAt);
    const endsAt = parseOptionalDate(req.body.endsAt);
    if (startsAt !== undefined) data.startsAt = startsAt;
    if (endsAt !== undefined) data.endsAt = endsAt;

    const effectiveType = (data.type as "PERCENT" | "FIXED" | undefined) ?? existing.type;
    const effectiveValue =
      (data.value as number | undefined) ?? Number(existing.value);
    const effectiveStartsAt =
      (data.startsAt as Date | undefined) ?? existing.startsAt ?? undefined;
    const effectiveEndsAt =
      (data.endsAt as Date | undefined) ?? existing.endsAt ?? undefined;

    validateCouponInput({
      type: effectiveType,
      value: effectiveValue,
      startsAt: effectiveStartsAt ?? undefined,
      endsAt: effectiveEndsAt ?? undefined
    });

    const coupon = await prisma.coupon.update({
      where: { id: req.params.id },
      data
    });
    res.json(coupon);
  } catch (err) {
    next(err);
  }
}

export async function deleteCoupon(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.coupon.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
