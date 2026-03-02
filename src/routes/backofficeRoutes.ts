import { Router } from "express";
import multer from "multer";
import { auth } from "../middlewares/auth.js";
import { permit } from "../middlewares/permit.js";
import { auditTrail } from "../middlewares/audit.js";
import { validate } from "../middlewares/validate.js";
import {
  addImageLink,
  addImageLinkSchema,
  addImageUpload,
  addImageUploadSchema,
  adjustStockHandler,
  adjustStockSchema,
  createProductHandler,
  createProductSchema,
  deleteImage,
  deleteImageSchema,
  idParamSchema,
  getOrder,
  listOrders,
  listOrderItems,
  listProducts,
  updateOrderPaymentStatus,
  updatePaymentStatusSchema,
  updateOrderStatus,
  updateOrderStatusSchema,
  updateProductHandler,
  updateProductSchema
} from "../controllers/backofficeController.js";

export const backofficeRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

backofficeRouter.use(auth);
backofficeRouter.use(auditTrail("backoffice"));

backofficeRouter.get("/products", permit("product:update"), listProducts);
backofficeRouter.post("/products", permit("product:create"), validate(createProductSchema), createProductHandler);
backofficeRouter.put("/products/:id", permit("product:update"), validate(updateProductSchema), updateProductHandler);

backofficeRouter.post("/products/:id/images/link", permit("product:update"), validate(addImageLinkSchema), addImageLink);
backofficeRouter.post(
  "/products/:id/images/upload",
  permit("product:update"),
  upload.single("file"),
  validate(addImageUploadSchema),
  addImageUpload
);
backofficeRouter.delete(
  "/products/:id/images/:imageId",
  permit("product:update"),
  validate(deleteImageSchema),
  deleteImage
);

backofficeRouter.post("/stock/adjust", permit("product:update"), validate(adjustStockSchema), adjustStockHandler);

backofficeRouter.get("/orders", permit("order:read"), listOrders);
backofficeRouter.get("/orders/:id", permit("order:read"), validate(idParamSchema), getOrder);
backofficeRouter.get("/orders/:id/items", permit("order:read"), validate(idParamSchema), listOrderItems);
backofficeRouter.patch("/orders/:id/status", permit("order:updateStatus"), validate(updateOrderStatusSchema), updateOrderStatus);
backofficeRouter.patch(
  "/orders/:id/payment-status",
  permit("order:updateStatus"),
  validate(updatePaymentStatusSchema),
  updateOrderPaymentStatus
);
