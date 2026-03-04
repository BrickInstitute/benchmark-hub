import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { processImage, getDominantColors } from "@/lib/image/image-processor";
import { getStorageProvider } from "@/lib/storage/storage-provider";
import { MAX_UPLOAD_SIZE } from "@/lib/constants";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided", success: false }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json({ error: "File too large (max 10MB)", success: false }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storage = getStorageProvider();

    // Process image
    const processed = await processImage(buffer);
    const colors = await getDominantColors(buffer);

    // Save files
    const id = nanoid();
    const imagePath = `benchmarks/${id}.webp`;
    const thumbnailPath = `benchmarks/${id}_thumb.webp`;

    await storage.save(imagePath, processed.buffer, "image/webp");
    await storage.save(thumbnailPath, processed.thumbnailBuffer, "image/webp");

    return NextResponse.json({
      data: {
        imagePath,
        thumbnailPath,
        imageUrl: storage.getUrl(imagePath),
        thumbnailUrl: storage.getUrl(thumbnailPath),
        width: processed.width,
        height: processed.height,
        fileSize: processed.fileSize,
        format: processed.format,
        dominantColors: colors,
      },
      success: true,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed", success: false }, { status: 500 });
  }
}
