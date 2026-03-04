import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { getStorageProvider } from "@/lib/storage/storage-provider";

const COMPARE_PROMPT = `Sen uzman bir UI/UX tasarımcısısın. Sana iki arayüz görseli veriliyor. Bunları detaylı şekilde karşılaştır.

Her iki görseli de aşağıdaki 6 kriterde 1-10 arasında puanla ve karşılaştır:

1. Visual Consistency (Görsel Tutarlılık)
2. Layout Quality (Düzen Kalitesi)
3. Typography (Tipografi)
4. Color Harmony (Renk Uyumu)
5. Whitespace Usage (Boşluk Kullanımı)
6. Accessibility (Erişilebilirlik)

IMPORTANT: Respond ONLY with valid JSON in the following format, no other text:
{
  "left": {
    "visualConsistency": <1-10>,
    "layoutQuality": <1-10>,
    "typography": <1-10>,
    "colorHarmony": <1-10>,
    "whitespaceUsage": <1-10>,
    "accessibilityScore": <1-10>,
    "overallScore": <1-10>
  },
  "right": {
    "visualConsistency": <1-10>,
    "layoutQuality": <1-10>,
    "typography": <1-10>,
    "colorHarmony": <1-10>,
    "whitespaceUsage": <1-10>,
    "accessibilityScore": <1-10>,
    "overallScore": <1-10>
  },
  "winner": "left" | "right" | "tie",
  "comparison": "<3-4 paragraf detaylı Türkçe karşılaştırma analizi. Her iki tasarımın güçlü ve zayıf yönlerini karşılaştır. Neden birinin diğerinden iyi/kötü olduğunu açıkla.>",
  "leftStrengths": ["<sol görselin güçlü yönü 1>", "<güçlü yön 2>", "<güçlü yön 3>"],
  "leftWeaknesses": ["<sol görselin zayıf yönü 1>", "<zayıf yön 2>"],
  "rightStrengths": ["<sağ görselin güçlü yönü 1>", "<güçlü yön 2>", "<güçlü yön 3>"],
  "rightWeaknesses": ["<sağ görselin zayıf yönü 1>", "<zayıf yön 2>"],
  "recommendation": "<Türkçe: Hangi tasarımı tercih etmeli ve neden? Kısa bir öneri.>"
}`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leftBenchmarkId, rightBenchmarkId, leftImageBase64, rightImageBase64 } = body;

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "AI API key not configured", success: false }, { status: 500 });
    }

    const storage = getStorageProvider();
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Resolve images - either from benchmark IDs or direct base64
    let leftBase64 = leftImageBase64;
    let rightBase64 = rightImageBase64;
    let leftMime = "image/webp";
    let rightMime = "image/webp";

    if (leftBenchmarkId && !leftBase64) {
      const benchmark = await prisma.benchmark.findUnique({ where: { id: leftBenchmarkId } });
      if (!benchmark) return NextResponse.json({ error: "Left benchmark not found", success: false }, { status: 404 });
      const buf = await storage.get(benchmark.imagePath);
      leftBase64 = buf.toString("base64");
      leftMime = benchmark.format === "png" ? "image/png" : "image/webp";
    }

    if (rightBenchmarkId && !rightBase64) {
      const benchmark = await prisma.benchmark.findUnique({ where: { id: rightBenchmarkId } });
      if (!benchmark) return NextResponse.json({ error: "Right benchmark not found", success: false }, { status: 404 });
      const buf = await storage.get(benchmark.imagePath);
      rightBase64 = buf.toString("base64");
      rightMime = benchmark.format === "png" ? "image/png" : "image/webp";
    }

    if (!leftBase64 || !rightBase64) {
      return NextResponse.json({ error: "Both images are required", success: false }, { status: 400 });
    }

    const response = await client.messages.create({
      model: process.env.AI_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "SOL GÖRSEL (Image A):",
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: leftMime as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
                data: leftBase64,
              },
            },
            {
              type: "text",
              text: "SAĞ GÖRSEL (Image B):",
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: rightMime as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
                data: rightBase64,
              },
            },
            {
              type: "text",
              text: COMPARE_PROMPT,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const rawText = textBlock && "text" in textBlock ? textBlock.text : "";

    // Parse JSON from response
    let jsonStr = rawText;
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) jsonStr = objectMatch[0];

    const result = JSON.parse(jsonStr);

    return NextResponse.json({
      data: result,
      tokens: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
      success: true,
    });
  } catch (error) {
    console.error("Compare error:", error);
    const message = error instanceof Error ? error.message : "Comparison failed";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
