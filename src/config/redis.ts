import { createClient } from "redis";
import { env } from "./env.js";

export const redis = env.redisUrl ? createClient({ url: env.redisUrl }) : null;

export async function connectRedis() {
  if (redis && !redis.isOpen) {
    await redis.connect();
  }
}
