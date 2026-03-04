import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { z } from "zod/v4";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  imagePath: z.string(),
  thumbnailPath: z.string().optional(),
  categoryId: z.string(),
  sourceUrl: z.string().optional(),
  sourceSite: z.string().optional(),
  tags: z.array(z.string()).optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  fileSize: z.number().optional(),
  format: z.string().optional(),
  dominantColors: z.array(z.string()).optional(),
  isUploaded: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || String(ITEMS_PER_PAGE));
  const category = searchParams.get("category");
  const search = searchParams.get("search");
  const sourceSite = searchParams.get("sourceSite");
  const minScore = searchParams.get("minScore");
  const maxScore = searchParams.get("maxScore");
  const sort = searchParams.get("sort") || "createdAt:desc";
  const tags = searchParams.get("tags");

  const where: Record<string, unknown> = {
    status: "ACTIVE",
  };

  if (category) {
    where.category = { slug: category };
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  if (sourceSite) {
    where.sourceSite = sourceSite;
  }

  if (minScore || maxScore) {
    where.overallScore = {};
    if (minScore) (where.overallScore as Record<string, number>).gte = parseFloat(minScore);
    if (maxScore) (where.overallScore as Record<string, number>).lte = parseFloat(maxScore);
  }

  if (tags) {
    const tagSlugs = tags.split(",");
    where.tags = {
      some: {
        tag: { slug: { in: tagSlugs } },
      },
    };
  }

  const [sortField, sortDir] = sort.split(":");
  const orderBy = { [sortField]: sortDir || "desc" };

  const [benchmarks, total] = await Promise.all([
    prisma.benchmark.findMany({
      where: where as never,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        tags: { include: { tag: { select: { id: true, name: true, slug: true } } } },
      },
      orderBy: orderBy as never,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.benchmark.count({ where: where as never }),
  ]);

  return NextResponse.json({
    data: benchmarks,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    success: true,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSchema.parse(body);

    const benchmark = await prisma.benchmark.create({
      data: {
        title: parsed.title,
        description: parsed.description,
        imagePath: parsed.imagePath,
        thumbnailPath: parsed.thumbnailPath,
        categoryId: parsed.categoryId,
        sourceUrl: parsed.sourceUrl,
        sourceSite: parsed.sourceSite,
        width: parsed.width,
        height: parsed.height,
        fileSize: parsed.fileSize,
        format: parsed.format,
        dominantColors: parsed.dominantColors,
        isUploaded: parsed.isUploaded ?? false,
        tags: parsed.tags
          ? {
              create: parsed.tags.map((tagId) => ({
                tag: { connect: { id: tagId } },
              })),
            }
          : undefined,
      },
      include: {
        category: true,
        tags: { include: { tag: true } },
      },
    });

    return NextResponse.json({ data: benchmark, success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues, success: false }, { status: 400 });
    }
    console.error("Error creating benchmark:", error);
    return NextResponse.json({ error: "Internal server error", success: false }, { status: 500 });
  }
}
