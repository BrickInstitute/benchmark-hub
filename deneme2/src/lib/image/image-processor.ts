import sharp from "sharp";
import { IMAGE_MAX_WIDTH, THUMBNAIL_WIDTH } from "@/lib/constants";

export interface ProcessedImage {
  buffer: Buffer;
  thumbnailBuffer: Buffer;
  width: number;
  height: number;
  format: string;
  fileSize: number;
}

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const metadata = await sharp(input).metadata();

  // Resize to max width if needed, convert to webp
  const processed = sharp(input).webp({ quality: 85 });
  if (metadata.width && metadata.width > IMAGE_MAX_WIDTH) {
    processed.resize(IMAGE_MAX_WIDTH);
  }
  const buffer = await processed.toBuffer();
  const info = await sharp(buffer).metadata();

  // Generate thumbnail
  const thumbnailBuffer = await sharp(input)
    .resize(THUMBNAIL_WIDTH)
    .webp({ quality: 75 })
    .toBuffer();

  return {
    buffer,
    thumbnailBuffer,
    width: info.width || 0,
    height: info.height || 0,
    format: "webp",
    fileSize: buffer.length,
  };
}

export async function getDominantColors(input: Buffer): Promise<string[]> {
  const { dominant } = await sharp(input).stats();
  const hex = `#${dominant.r.toString(16).padStart(2, "0")}${dominant.g.toString(16).padStart(2, "0")}${dominant.b.toString(16).padStart(2, "0")}`;

  // Get a few color samples by resizing to small image
  const small = await sharp(input).resize(5, 5, { fit: "cover" }).raw().toBuffer();
  const colors = new Set<string>([hex]);
  for (let i = 0; i < small.length; i += 3) {
    const r = small[i].toString(16).padStart(2, "0");
    const g = small[i + 1].toString(16).padStart(2, "0");
    const b = small[i + 2].toString(16).padStart(2, "0");
    colors.add(`#${r}${g}${b}`);
  }

  return Array.from(colors).slice(0, 6);
}
