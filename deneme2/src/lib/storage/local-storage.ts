import fs from "fs/promises";
import path from "path";
import type { StorageProvider } from "./storage-provider";

export class LocalStorage implements StorageProvider {
  private uploadDir: string;

  constructor() {
    // Use /app/data on Railway (persistent volume), ./public/uploads locally
    this.uploadDir = process.env.UPLOAD_DIR || (process.env.RAILWAY_ENVIRONMENT ? "/app/data/uploads" : "./public/uploads");
  }

  async save(key: string, data: Buffer, _contentType: string): Promise<string> {
    const filePath = path.join(this.uploadDir, key);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, data);
    return key;
  }

  async get(key: string): Promise<Buffer> {
    const filePath = path.join(this.uploadDir, key);
    return fs.readFile(filePath);
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.uploadDir, key);
    await fs.unlink(filePath).catch(() => {});
  }

  getUrl(key: string): string {
    // Each path segment is encoded separately. Encoding the whole key turns
    // "captures/abc/full.png" into one segment containing %2F, which the
    // [...path] route cannot resolve back to a file.
    return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
}
