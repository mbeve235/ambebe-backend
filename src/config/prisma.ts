import { PrismaClient } from "@prisma/client";
import { env } from "./env.js";
import { logger } from "./logger.js";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["warn", "error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

type DatabaseTarget = {
  provider: string;
  host: string;
  port: number | null;
  database: string;
};

let connectionAttempt = 0;

function resolveDatabaseTarget(databaseUrl: string): DatabaseTarget {
  try {
    const parsed = new URL(databaseUrl);
    return {
      provider: parsed.protocol.replace(":", ""),
      host: parsed.hostname || "unknown",
      port: parsed.port ? Number(parsed.port) : null,
      database: parsed.pathname.replace(/^\//, "") || "unknown"
    };
  } catch {
    return {
      provider: "unknown",
      host: "unknown",
      port: null,
      database: "unknown"
    };
  }
}

export async function connectDatabase() {
  connectionAttempt += 1;
  const attempt = connectionAttempt;
  const startedAt = Date.now();
  const target = resolveDatabaseTarget(env.databaseUrl);

  logger.info(
    { event: "db_connection_attempt", attempt, target },
    "Attempting database connection"
  );

  try {
    await prisma.$connect();
    logger.info(
      {
        event: "db_connection_success",
        attempt,
        target,
        durationMs: Date.now() - startedAt
      },
      "Database connection established"
    );
  } catch (err) {
    logger.error(
      {
        event: "db_connection_failure",
        attempt,
        target,
        durationMs: Date.now() - startedAt,
        err
      },
      "Database connection failed"
    );
    throw err;
  }
}
