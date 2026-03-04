import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const uploadDir = process.env.UPLOAD_DIR || "./public/uploads";

export async function GET(
  _request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const filePath = path.join(uploadDir, ...params.path);

    // Prevent directory traversal
    const resolved = path.resolve(filePath);
    const resolvedBase = path.resolve(uploadDir);
    if (!resolved.startsWith(resolvedBase)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const buffer = await fs.readFile(resolved);

    const ext = path.extname(resolved).toLowerCase();
    const contentTypes: Record<string, string> = {
      ".webp": "image/webp",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
    };

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentTypes[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
