import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma.js";
import { productRepo } from "../repositories/productRepo.js";
import { z } from "zod";
import { ApiError } from "../utils/apiError.js";

export async function listCategories(_req: Request, res: Response, next: NextFunction) {
  try {
    const categories = await prisma.category.findMany();
    res.json({ items: categories });
  } catch (err) {
    next(err);
  }
}

export async function listProducts(_req: Request, res: Response, next: NextFunction) {
  try {
    const products = await productRepo.listPublic();
    res.json({ items: products });
  } catch (err) {
    next(err);
  }
}

export const getProductSchema = z.object({
  params: z.object({ id: z.string().uuid() })
});

export async function getProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productRepo.findById(req.params.id);
    if (!product) {
      throw new ApiError(404, "not_found", "Product not found");
    }
    res.json(product);
  } catch (err) {
    next(err);
  }
}
