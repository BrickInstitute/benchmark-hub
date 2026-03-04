export interface StorageProvider {
  save(key: string, data: Buffer, contentType: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}

export function getStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER || "local";

  if (provider === "s3") {
    // Dynamic import to avoid loading S3 SDK when not needed
    const { S3Storage } = require("./s3-storage");
    return new S3Storage();
  }

  const { LocalStorage } = require("./local-storage");
  return new LocalStorage();
}
