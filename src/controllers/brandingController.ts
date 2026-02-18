import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { getStorageProvider } from "../services/storage.js";
import { env } from "../config/env.js";

const BRANDING_KEY = "default";
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const FAVICON_TYPES = new Set(["image/png", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"]);

async function ensureBranding() {
  return prisma.branding.upsert({
    where: { key: BRANDING_KEY },
    create: { key: BRANDING_KEY },
    update: {}
  });
}

function validateFile(file: Express.Multer.File, allowed: Set<string>) {
  if (!file) {
    throw new ApiError(400, "missing_file", "File is required");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new ApiError(400, "file_too_large", "File too large");
  }
  if (!allowed.has(file.mimetype)) {
    throw new ApiError(400, "invalid_file_type", "Unsupported file type");
  }
}

async function saveBrandingAsset(file: Express.Multer.File, currentKey?: string | null) {
  const storage = getStorageProvider();
  const saved = await storage.save({
    filename: file.originalname,
    buffer: file.buffer,
    mimeType: file.mimetype
  });

  if (currentKey) {
    await storage.remove(currentKey);
  }

  return saved;
}

export async function getBranding(_req: Request, res: Response, next: NextFunction) {
  try {
    const branding = await ensureBranding();
    res.json(branding);
  } catch (err) {
    next(err);
  }
}

export async function uploadLogo(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw new ApiError(400, "missing_file", "File is required");
    }
    validateFile(req.file, LOGO_TYPES);

    const branding = await ensureBranding();
    const saved = await saveBrandingAsset(req.file, branding.logoKey);

    const updated = await prisma.branding.update({
      where: { key: BRANDING_KEY },
      data: {
        logoUrl: saved.url,
        logoKey: saved.key
      }
    });

    res.json({
      ...updated,
      provider: env.storageProvider === "s3" ? "S3" : "LOCAL"
    });
  } catch (err) {
    next(err);
  }
}

export async function uploadFavicon(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw new ApiError(400, "missing_file", "File is required");
    }
    validateFile(req.file, FAVICON_TYPES);

    const branding = await ensureBranding();
    const saved = await saveBrandingAsset(req.file, branding.faviconKey);

    const updated = await prisma.branding.update({
      where: { key: BRANDING_KEY },
      data: {
        faviconUrl: saved.url,
        faviconKey: saved.key
      }
    });

    res.json({
      ...updated,
      provider: env.storageProvider === "s3" ? "S3" : "LOCAL"
    });
  } catch (err) {
    next(err);
  }
}
