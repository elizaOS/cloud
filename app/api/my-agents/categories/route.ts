import { NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { getAllCategories } from "@/lib/constants/character-categories";

export const dynamic = "force-dynamic";

/**
 * GET /api/my-agents/categories
 * Get available character categories.
 */
export async function GET() {
  try {
    await requireAuthWithOrg();

    const categories = getAllCategories();

    return NextResponse.json({
      success: true,
      data: {
        categories: categories.map((cat) => ({
          id: cat.id,
          name: cat.name,
          description: cat.description,
          icon: cat.icon,
          color: cat.color,
          count: 0, // Count was from marketplace service
        })),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to get categories" },
      { status: 500 },
    );
  }
}
