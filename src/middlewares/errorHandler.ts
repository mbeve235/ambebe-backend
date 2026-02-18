import { Request, Response, NextFunction } from "express";
import { logger } from "../config/logger.js";
import { ApiError, isApiError } from "../utils/apiError.js";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.requestId;

  if (isApiError(err)) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
      requestId
    });
    return;
  }

  const message = err instanceof Error ? err.message : "Unexpected error";
  logger.error({ err, requestId }, "Unhandled error");

  const apiError = new ApiError(500, "internal_error", message);
  res.status(apiError.status).json({
    error: { code: apiError.code, message: apiError.message },
    requestId
  });
}
