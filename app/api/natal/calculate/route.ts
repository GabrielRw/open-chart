import { NextRequest, NextResponse } from "next/server";

import { calculateNatal } from "@/lib/api/freeastro";
import { toErrorResponse } from "@/lib/errors";
import { natalRequestSchema } from "@/lib/schemas/astro";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const parsed = natalRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_PAYLOAD",
            message: "Invalid natal request payload.",
            details: parsed.error.flatten(),
          },
        },
        { status: 400 },
      );
    }

    const data = await calculateNatal(parsed.data);
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
