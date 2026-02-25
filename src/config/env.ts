import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

function normalizeEnv(value?: string) {
  if (!value) return "";
  return value.trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
}

function requireEnv(key: string, fallback?: string) {
  const value = normalizeEnv(process.env[key] ?? fallback);
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(currentDir, "..", "..");
const rawUploadDir = normalizeEnv(process.env.UPLOAD_DIR) || (process.env.VERCEL ? "/tmp/uploads" : "./uploads");
const uploadDir = path.isAbsolute(rawUploadDir) ? rawUploadDir : path.resolve(appRoot, rawUploadDir);
const parseBool = (value?: string) => (value || "").toLowerCase() === "true";




export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  databaseUrl: requireEnv("DATABASE_URL", process.env.POSTGRES_URL),
  jwtAccessSecret: requireEnv("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: requireEnv("JWT_REFRESH_SECRET"),
  jwtAccessTtl: process.env.JWT_ACCESS_TTL || "15m",
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL || "30d",
  corsOrigin: (process.env.CORS_ORIGIN || "http://127.0.0.1:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  uploadDir,
  appBaseUrl: process.env.APP_BASE_URL || "http://127.0.0.1:3000",
  storageProvider: normalizeEnv(process.env.STORAGE_PROVIDER) || "local",
  s3: {
    region: normalizeEnv(process.env.S3_REGION),
    bucket: normalizeEnv(process.env.S3_BUCKET),
    accessKeyId: normalizeEnv(process.env.S3_ACCESS_KEY_ID),
    secretAccessKey: normalizeEnv(process.env.S3_SECRET_ACCESS_KEY),
    endpoint: normalizeEnv(process.env.S3_ENDPOINT),
    publicBaseUrl: normalizeEnv(process.env.S3_PUBLIC_BASE_URL),
    forcePathStyle: parseBool(normalizeEnv(process.env.S3_FORCE_PATH_STYLE))
  },
  redisUrl: process.env.REDIS_URL || "",
  rateLimit: {
    points: Number(process.env.RATE_LIMIT_POINTS || 30),
    duration: Number(process.env.RATE_LIMIT_DURATION || 60)
  },
  mail: {
    host: process.env.MAIL_HOST || "",
    port: Number(process.env.MAIL_PORT || 587),
    user: process.env.MAIL_USER || "",
    pass: process.env.MAIL_PASS || "",
    from: process.env.MAIL_FROM || ""
  },
  supportEmail: process.env.SUPPORT_EMAIL || process.env.MAIL_FROM || ""
};

