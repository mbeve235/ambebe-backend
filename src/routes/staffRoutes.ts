import { Router } from "express";
import multer from "multer";
import { auth } from "../middlewares/auth.js";
import { permit } from "../middlewares/permit.js";
import { auditTrail } from "../middlewares/audit.js";
import { validate } from "../middlewares/validate.js";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  categorySchema,
  updateCategorySchema,
  idParamSchema,
  listProducts,
  createProductHandler,
  productSchema,
  getProduct,
  updateProductHandler,
  updateProductSchema,
  updateProductStatus,
  updateStatusSchema,
  deleteProduct,
  replaceProductCategories,
  categoryReplaceSchema,
  productCategoryParamSchema,
  addProductCategory,
  deleteProductCategory,
  listVariants,
  createVariant,
  variantSchema,
  updateVariantSchema,
  updateVariant,
  deleteVariant,
  addImageLink,
  addImageLinkSchema,
  addImageUpload,
  addImageUploadSchema,
  updateImage,
  updateImageSchema,
  imageParamSchema,
  deleteImage,
  listStockItems,
  createStockItem,
  createStockItemSchema,
  getStockItem,
  listStockMovements,
  createMovement,
  movementSchema,
  listOrders,
  getOrder,
  listOrderItems,
  updateOrderStatus,
  updateOrderStatusSchema,
  updateOrderPaymentStatus,
  updatePaymentStatusSchema,
  listPayments,
  getPayment
} from "../controllers/staffController.js";
import { getStaffDashboard, staffDashboardSchema } from "../controllers/staffDashboardController.js";

export const staffRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

staffRouter.use(auth);
staffRouter.use(auditTrail("staff"));

// Categories
staffRouter.get("/categories", permit("product:update"), listCategories);
staffRouter.post("/categories", permit("product:create"), validate(categorySchema), createCategory);
staffRouter.put("/categories/:id", permit("product:update"), validate(updateCategorySchema), updateCategory);
staffRouter.delete("/categories/:id", permit("product:update"), validate(idParamSchema), deleteCategory);

// Products
staffRouter.get("/products", permit("product:update"), listProducts);
staffRouter.post("/products", permit("product:create"), validate(productSchema), createProductHandler);
staffRouter.get("/products/:id", permit("product:update"), validate(idParamSchema), getProduct);
staffRouter.put("/products/:id", permit("product:update"), validate(updateProductSchema), updateProductHandler);
staffRouter.patch("/products/:id/status", permit("product:update"), validate(updateStatusSchema), updateProductStatus);
staffRouter.delete("/products/:id", permit("product:update"), validate(idParamSchema), deleteProduct);

staffRouter.put("/products/:id/categories", permit("product:update"), validate(categoryReplaceSchema), replaceProductCategories);
staffRouter.post("/products/:id/categories/:categoryId", permit("product:update"), validate(productCategoryParamSchema), addProductCategory);
staffRouter.delete("/products/:id/categories/:categoryId", permit("product:update"), validate(productCategoryParamSchema), deleteProductCategory);

// Variants
staffRouter.get("/products/:id/variants", permit("product:update"), validate(idParamSchema), listVariants);
staffRouter.post("/products/:id/variants", permit("product:create"), validate(variantSchema), createVariant);
staffRouter.put("/variants/:id", permit("product:update"), validate(updateVariantSchema), updateVariant);
staffRouter.delete("/variants/:id", permit("product:update"), validate(idParamSchema), deleteVariant);

// Images
staffRouter.post("/products/:id/images/link", permit("product:update"), validate(addImageLinkSchema), addImageLink);
staffRouter.post(
  "/products/:id/images/upload",
  permit("product:update"),
  upload.single("file"),
  validate(addImageUploadSchema),
  addImageUpload
);
staffRouter.patch("/products/:id/images/:imageId", permit("product:update"), validate(updateImageSchema), updateImage);
staffRouter.delete("/products/:id/images/:imageId", permit("product:update"), validate(imageParamSchema), deleteImage);

// Inventory
staffRouter.get("/inventory/stock-items", permit("product:update"), listStockItems);
staffRouter.post("/inventory/stock-items", permit("product:update"), validate(createStockItemSchema), createStockItem);
staffRouter.get("/inventory/stock-items/:id", permit("product:update"), validate(idParamSchema), getStockItem);
staffRouter.get("/inventory/stock-items/:id/movements", permit("product:update"), validate(idParamSchema), listStockMovements);
staffRouter.post("/inventory/movements", permit("product:update"), validate(movementSchema), createMovement);

// Orders
staffRouter.get("/orders", permit("order:read"), listOrders);
staffRouter.get("/orders/:id", permit("order:read"), validate(idParamSchema), getOrder);
staffRouter.get("/orders/:id/items", permit("order:read"), validate(idParamSchema), listOrderItems);
staffRouter.patch("/orders/:id/status", permit("order:updateStatus"), validate(updateOrderStatusSchema), updateOrderStatus);
staffRouter.patch(
  "/orders/:id/payment-status",
  permit("order:updateStatus"),
  validate(updatePaymentStatusSchema),
  updateOrderPaymentStatus
);

// Payments
staffRouter.get("/payments", permit("order:read"), listPayments);
staffRouter.get("/payments/:id", permit("order:read"), validate(idParamSchema), getPayment);

// Dashboard analytics
staffRouter.get("/dashboard", permit("order:read"), validate(staffDashboardSchema), getStaffDashboard);
