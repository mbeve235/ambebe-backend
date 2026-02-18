import fs from "fs/promises";
import path from "path";
import { PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../config/env.js";

export type StorageSaveInput = {
  filename: string;
  buffer: Buffer;
  mimeType?: string;
};

export type StorageSaveResult = {
  url: string;
  key: string;
};

export interface StorageProvider {
  save(input: StorageSaveInput): Promise<StorageSaveResult>;
  remove(key: string): Promise<void>;
}

export class LocalStorage implements StorageProvider {
  private uploadDir: string;

  constructor(uploadDir: string) {
    this.uploadDir = uploadDir;
  }

  async save(input: StorageSaveInput): Promise<StorageSaveResult> {
    await fs.mkdir(this.uploadDir, { recursive: true });
    const key = `${Date.now()}-${input.filename}`.replace(/\s+/g, "-");
    const filePath = path.join(this.uploadDir, key);
    await fs.writeFile(filePath, input.buffer);
    return { url: `/uploads/${key}`, key };
  }

  async remove(key: string): Promise<void> {
    const filePath = path.join(this.uploadDir, key);
    await fs.rm(filePath, { force: true });
  }
}

export class S3Storage implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    if (!env.s3.bucket || !env.s3.region) {
      throw new Error("S3 config missing");
    }
    this.client = new S3Client({
      region: env.s3.region,
      credentials: {
        accessKeyId: env.s3.accessKeyId,
        secretAccessKey: env.s3.secretAccessKey
      }
    });
    this.bucket = env.s3.bucket;
  }

  async save(input: StorageSaveInput): Promise<StorageSaveResult> {
    const key = `${Date.now()}-${input.filename}`.replace(/\s+/g, "-");
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.mimeType
      })
    );
    return { url: `https://${this.bucket}.s3.amazonaws.com/${key}`, key };
  }

  async remove(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key
      })
    );
  }
}

export function getStorageProvider(): StorageProvider {
  if (env.storageProvider === "s3") {
    return new S3Storage();
  }
  return new LocalStorage(env.uploadDir);
}
