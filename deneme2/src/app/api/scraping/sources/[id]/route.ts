import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const source = await prisma.scrapingSource.update({
      where: { id: params.id },
      data: body,
    });
    return NextResponse.json({ data: source, success: true });
  } catch {
    return NextResponse.json({ error: "Update failed", success: false }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  await prisma.scrapingSource.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
