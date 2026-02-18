import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/apiError.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { prisma } from "../config/prisma.js";

export async function auth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return next(new ApiError(401, "unauthorized", "Missing access token"));
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: {
          include: { permissions: { include: { permission: true } } }
        }
      }
    });

    if (!user) {
      return next(new ApiError(401, "unauthorized", "User not found"));
    }

    req.user = user;
    req.permissions = user.role.permissions.map((rp) => rp.permission.code);
    return next();
  } catch (err) {
    return next(new ApiError(401, "unauthorized", "Invalid access token"));
  }
}
