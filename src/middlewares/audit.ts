import { Request, Response, NextFunction } from "express";
import { writeAuditLog } from "../services/auditLogService.js";
import { logger } from "../config/logger.js";
import { prisma } from "../config/prisma.js";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SENSITIVE_KEYS = ["password", "token", "refresh", "secret", "authorization", "code", "file"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeObject(input: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  Object.entries(input).forEach(([key, value]) => {
    const lower = key.toLowerCase();
    if (SENSITIVE_KEYS.some((sensitive) => lower.includes(sensitive))) {
      return;
    }
    if (typeof value === "string" && value.length > 500) {
      output[key] = value.slice(0, 500);
      return;
    }
    if (isPlainObject(value)) {
      output[key] = sanitizeObject(value);
      return;
    }
    output[key] = value;
  });
  return output;
}

function resolveEntity(path: string) {
  const segments = path.split("/").filter(Boolean);
  if (!segments.length) return "system";
  if (segments[0] === "v1" && segments.length > 2) {
    return segments[2];
  }
  return segments[1] ?? segments[0];
}

function resolveEntityId(params: Record<string, string>) {
  const values = Object.values(params);
  return values.length ? values[0] : null;
}

export function auditTrail(scope: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const method = req.method.toUpperCase();
    if (!MUTATION_METHODS.has(method)) {
      return next();
    }

    const fullPath = `${req.baseUrl}${req.path}`;
    try {
      const prev = await getPreState(method, fullPath, req.params);
      if (prev) {
        res.locals.auditPrev = prev;
      }
    } catch (err) {
      logger.warn({ err }, "Failed to capture audit pre-state");
    }

    const start = Date.now();
    res.on("finish", () => {
      if (res.statusCode >= 400) return;
      if (!req.user) return;

      const path = fullPath;
      const entity = resolveEntity(path);
      const entityId = resolveEntityId(req.params);
      const body = isPlainObject(req.body) ? sanitizeObject(req.body) : undefined;
      const meta: Record<string, unknown> = {
        scope,
        method,
        path,
        status: res.statusCode,
        durationMs: Date.now() - start,
        params: req.params,
        query: req.query
      };

      if (body && Object.keys(body).length) {
        meta.body = body;
      }

      if (res.locals.auditPrev) {
        meta.prev = res.locals.auditPrev;
      }

      if (req.file) {
        meta.file = {
          name: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size
        };
      }

      void writeAuditLog(req.user.id, `${method} ${path}`, entity, entityId, meta).catch((err) => {
        logger.warn({ err }, "Failed to write audit log");
      });
    });

    return next();
  };
}

async function getPreState(method: string, path: string, params: Record<string, string>) {
  if (method === "PUT" || method === "PATCH" || method === "DELETE") {
    if (path.match(/\/coupons\/[^/]+$/)) {
      const coupon = await prisma.coupon.findUnique({ where: { id: params.id } });
      return coupon ? { coupon } : null;
    }

    if (path.match(/\/products\/[^/]+$/) || path.match(/\/products\/[^/]+\/status$/)) {
      const product = await prisma.product.findUnique({
        where: { id: params.id },
        include: { categories: true }
      });
      if (!product) return null;
      return {
        product: {
          id: product.id,
          name: product.name,
          slug: product.slug,
          description: product.description,
          basePrice: product.basePrice,
          status: product.status,
          categoryIds: product.categories.map((category) => category.categoryId)
        }
      };
    }

    if (path.match(/\/orders\/[^/]+\/status$/) || path.match(/\/orders\/[^/]+\/payment-status$/)) {
      const order = await prisma.order.findUnique({
        where: { id: params.id },
        select: { id: true, status: true, paymentStatus: true }
      });
      return order ? { order } : null;
    }
  }

  return null;
}
