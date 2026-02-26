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
      const firstFieldError = Object.values(details.fieldErrors).find(
        (messages) => Array.isArray(messages) && messages.length
      )?.[0];
      const formError = details.formErrors?.[0];
      const message = firstFieldError || formError || "Invalid request";
      return next(new ApiError(400, "validation_error", message, details));
    }

    req.body = result.data.body;
    req.query = result.data.query;
    req.params = result.data.params;
    return next();
  };
}
