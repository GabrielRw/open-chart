import { NextRequest, NextResponse } from "next/server";

import { searchCities } from "@/lib/api/freeastro";
import { toErrorResponse } from "@/lib/errors";
import { geoSearchQuerySchema } from "@/lib/schemas/astro";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const parsed = geoSearchQuerySchema.safeParse({
      q: request.nextUrl.searchParams.get("q"),
      limit: request.nextUrl.searchParams.get("limit") ?? "10",
      country: request.nextUrl.searchParams.get("country") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_QUERY",
            message: "Invalid search query.",
            details: parsed.error.flatten(),
          },
        },
        { status: 400 },
      );
    }

    const data = await searchCities(parsed.data);
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
