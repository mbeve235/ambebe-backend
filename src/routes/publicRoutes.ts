import { Router } from "express";
import { listCategories, listProducts, getProduct, getProductSchema } from "../controllers/publicController.js";
import { rateLimit } from "../middlewares/rateLimit.js";
import { validate } from "../middlewares/validate.js";

export const publicRouter = Router();

publicRouter.get("/categories", rateLimit(), listCategories);
publicRouter.get("/products", rateLimit(), listProducts);
publicRouter.get("/products/:id", rateLimit(), validate(getProductSchema), getProduct);
