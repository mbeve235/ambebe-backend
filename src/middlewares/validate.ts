import { ZodSchema } from "zod";
import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/apiError.js";

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
      headers: req.headers
    });

    if (!result.success) {
      const details = result.error.flatten();
      return next(new ApiError(400, "validation_error", "Invalid request", details));
    }

    req.body = result.data.body;
    req.query = result.data.query;
    req.params = result.data.params;
    return next();
  };
}
