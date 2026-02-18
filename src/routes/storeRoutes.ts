import { Router } from "express";
import { validate } from "../middlewares/validate.js";
import {
  listCategories,
  getCategory,
  listCategoryProducts,
  listProducts,
  getProduct,
  getProductBySlug,
  listProductVariants,
  getVariant,
  listProductImages,
  getVariantAvailability,
  idParamSchema,
  slugParamSchema,
  listProductsSchema
} from "../controllers/storeController.js";
import { getBranding } from "../controllers/brandingController.js";

export const storeRouter = Router();

storeRouter.get("/categories", listCategories);
storeRouter.get("/categories/:id", validate(idParamSchema), getCategory);
storeRouter.get("/categories/:id/products", validate(idParamSchema), listCategoryProducts);

storeRouter.get("/products", validate(listProductsSchema), listProducts);
storeRouter.get("/products/:id", validate(idParamSchema), getProduct);
storeRouter.get("/products/slug/:slug", validate(slugParamSchema), getProductBySlug);
storeRouter.get("/products/:id/variants", validate(idParamSchema), listProductVariants);
storeRouter.get("/products/:id/images", validate(idParamSchema), listProductImages);

storeRouter.get("/variants/:id", validate(idParamSchema), getVariant);
storeRouter.get("/variants/:id/availability", validate(idParamSchema), getVariantAvailability);

storeRouter.get("/branding", getBranding);
