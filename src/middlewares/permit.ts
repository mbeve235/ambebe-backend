import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/apiError.js";

export function permit(...required: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const perms = req.permissions || [];
    const ok = required.every((perm) => perms.includes(perm));
    if (!ok) {
      return next(new ApiError(403, "forbidden", "Insufficient permissions"));
    }
    return next();
  };
}
