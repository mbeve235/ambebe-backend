import { Router } from "express";
import multer from "multer";
import { auth } from "../middlewares/auth.js";
import { permit } from "../middlewares/permit.js";
import { auditTrail } from "../middlewares/audit.js";
import { validate } from "../middlewares/validate.js";
import {
  createUser,
  createUserSchema,
  createRole,
  createRoleSchema,
  createCoupon,
  createCouponSchema,
  createPermission,
  createPermissionSchema,
  deletePermission,
  deleteRole,
  deleteRolePermission,
  deleteCoupon,
  deleteUser,
  addRolePermission,
  getAuditLog,
  getIdempotencyKey,
  getCoupon,
  getUser,
  listIdempotencyKeys,
  listIdempotencyKeysSchema,
  listAuditLogs,
  listCoupons,
  listPermissions,
  listRoles,
  listRolePermissions,
  listUsers,
  replaceRolePermissions,
  replaceRolePermissionsSchema,
  updatePermission,
  updatePermissionSchema,
  updateRole,
  updateRoleSchema,
  updateCoupon,
  updateCouponSchema,
  updateUserPassword,
  updateUserPasswordSchema,
  updateUserRole,
  updateUserRoleSchema,
  userIdParamSchema,
  rolePermissionSchema,
  listSupportMessages,
  supportMessageListSchema,
  supportMessageIdSchema,
  getSupportMessage,
  supportMessageUpdateSchema,
  updateSupportMessage,
  supportReplySchema,
  createSupportReply,
  undoAuditLog,
  undoAuditLogSchema
} from "../controllers/adminController.js";
import { uploadFavicon, uploadLogo } from "../controllers/brandingController.js";

export const adminRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

adminRouter.use(auth, permit("user:manage"), auditTrail("admin"));

adminRouter.post("/users", validate(createUserSchema), createUser);
adminRouter.get("/users", listUsers);
adminRouter.get("/users/:id", validate(userIdParamSchema), getUser);
adminRouter.delete("/users/:id", validate(userIdParamSchema), deleteUser);
adminRouter.patch("/users/:id/password", validate(updateUserPasswordSchema), updateUserPassword);
adminRouter.patch("/users/:id/role", validate(updateUserRoleSchema), updateUserRole);

adminRouter.get("/roles", listRoles);
adminRouter.post("/roles", validate(createRoleSchema), createRole);
adminRouter.put("/roles/:id", validate(updateRoleSchema), updateRole);
adminRouter.delete("/roles/:id", validate(userIdParamSchema), deleteRole);

adminRouter.get("/coupons", listCoupons);
adminRouter.get("/coupons/:id", validate(userIdParamSchema), getCoupon);
adminRouter.post("/coupons", validate(createCouponSchema), createCoupon);
adminRouter.put("/coupons/:id", validate(updateCouponSchema), updateCoupon);
adminRouter.delete("/coupons/:id", validate(userIdParamSchema), deleteCoupon);

adminRouter.get("/permissions", listPermissions);
adminRouter.post("/permissions", validate(createPermissionSchema), createPermission);
adminRouter.put("/permissions/:id", validate(updatePermissionSchema), updatePermission);
adminRouter.delete("/permissions/:id", validate(userIdParamSchema), deletePermission);

adminRouter.get("/roles/:id/permissions", validate(userIdParamSchema), listRolePermissions);
adminRouter.put("/roles/:id/permissions", validate(replaceRolePermissionsSchema), replaceRolePermissions);
adminRouter.post("/roles/:id/permissions/:permissionId", validate(rolePermissionSchema), addRolePermission);
adminRouter.delete("/roles/:id/permissions/:permissionId", validate(rolePermissionSchema), deleteRolePermission);

adminRouter.get("/audit-logs", listAuditLogs);
adminRouter.get("/audit-logs/:id", validate(userIdParamSchema), getAuditLog);
adminRouter.post("/audit-logs/:id/undo", validate(undoAuditLogSchema), undoAuditLog);

adminRouter.get("/idempotency-keys", validate(listIdempotencyKeysSchema), listIdempotencyKeys);
adminRouter.get("/idempotency-keys/:id", validate(userIdParamSchema), getIdempotencyKey);

adminRouter.get("/support/messages", validate(supportMessageListSchema), listSupportMessages);
adminRouter.get("/support/messages/:id", validate(supportMessageIdSchema), getSupportMessage);
adminRouter.patch("/support/messages/:id", validate(supportMessageUpdateSchema), updateSupportMessage);
adminRouter.post("/support/messages/:id/replies", validate(supportReplySchema), createSupportReply);

adminRouter.post("/branding/logo", upload.single("file"), uploadLogo);
adminRouter.post("/branding/favicon", upload.single("file"), uploadFavicon);
