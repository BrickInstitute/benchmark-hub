import { getDominantColors } from "@/lib/image/image-processor";

export interface ExtractedMetadata {
  dominantColors: string[];
  layoutType?: string;
}

export async function extractMetadata(imageBuffer: Buffer): Promise<ExtractedMetadata> {
  const dominantColors = await getDominantColors(imageBuffer);

  return {
    dominantColors,
  };
}
