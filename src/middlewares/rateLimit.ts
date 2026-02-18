import { Request, Response, NextFunction } from "express";
import { RateLimiterMemory, RateLimiterRedis } from "rate-limiter-flexible";
import { env } from "../config/env.js";
import { redis } from "../config/redis.js";
import { ApiError } from "../utils/apiError.js";

const limiter = redis
  ? new RateLimiterRedis({
      storeClient: redis,
      points: env.rateLimit.points,
      duration: env.rateLimit.duration
    })
  : new RateLimiterMemory({
      points: env.rateLimit.points,
      duration: env.rateLimit.duration
    });

export function rateLimit() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const key = req.ip || "anonymous";
      await limiter.consume(key);
      return next();
    } catch {
      return next(new ApiError(429, "rate_limited", "Too many requests"));
    }
  };
}
