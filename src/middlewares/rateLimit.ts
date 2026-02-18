import { Request, Response, NextFunction } from "express";
import { RateLimiterMemory, RateLimiterRedis } from "rate-limiter-flexible";
import { env } from "../config/env.js";
import { redis } from "../config/redis.js";
import { ApiError } from "../utils/apiError.js";

const memoryLimiter = new RateLimiterMemory({
  points: env.rateLimit.points,
  duration: env.rateLimit.duration
});

const redisLimiter = redis
  ? new RateLimiterRedis({
      storeClient: redis,
      points: env.rateLimit.points,
      duration: env.rateLimit.duration
    })
  : null;

export function rateLimit() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const key = req.ip || "anonymous";
      if (redisLimiter && redis?.isOpen) {
        await redisLimiter.consume(key);
      } else {
        await memoryLimiter.consume(key);
      }
      return next();
    } catch {
      return next(new ApiError(429, "rate_limited", "Too many requests"));
    }
  };
}
