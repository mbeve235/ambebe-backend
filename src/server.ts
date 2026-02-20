import { app } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase } from "./config/prisma.js";
import { connectRedis } from "./config/redis.js";
import { logger } from "./config/logger.js";

async function start() {
  await connectDatabase();

  try {
    await connectRedis();
  } catch (err) {
    logger.warn({ err }, "Redis not available, using in-memory rate limit");
  }

  app.listen(env.port, "0.0.0.0", () => {
    logger.info({ port: env.port }, "API server running");
  });
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
