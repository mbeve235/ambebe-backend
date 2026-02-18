import { prisma } from "../config/prisma.js";
import { getStorageProvider } from "./storage.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/apiError.js";

export async function addImageByLink(productId: string, url: string, sortOrder = 0) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    throw new ApiError(404, "not_found", "Product not found");
  }

  return prisma.productImage.create({
    data: {
      productId,
      url,
      provider: "EXTERNAL",
      sortOrder
    }
  });
}

export async function addImageByUpload(productId: string, file: Express.Multer.File, sortOrder = 0) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    throw new ApiError(404, "not_found", "Product not found");
  }

  const storage = getStorageProvider();
  const saved = await storage.save({
    filename: file.originalname,
    buffer: file.buffer,
    mimeType: file.mimetype
  });

  return prisma.productImage.create({
    data: {
      productId,
      url: saved.url,
      storageKey: saved.key,
      provider: env.storageProvider === "s3" ? "S3" : "LOCAL",
      mimeType: file.mimetype,
      sizeBytes: file.size,
      sortOrder
    }
  });
}

export async function deleteProductImage(productId: string, imageId: string) {
  const image = await prisma.productImage.findUnique({ where: { id: imageId } });
  if (!image || image.productId !== productId) {
    throw new ApiError(404, "not_found", "Image not found");
  }

  if (image.provider === "LOCAL" && image.storageKey) {
    const storage = getStorageProvider();
    await storage.remove(image.storageKey);
  }

  await prisma.productImage.delete({ where: { id: imageId } });
}
