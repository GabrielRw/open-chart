import { NextResponse } from "next/server";

export class ApiProxyError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiProxyError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const defaultMessages: Record<number, string> = {
  400: "Invalid request payload.",
  401: "Authentication failed with upstream API.",
  403: "Upstream API access denied.",
  404: "Requested resource not found.",
  408: "Request timed out.",
  429: "Rate limit reached. Try again shortly.",
  500: "Upstream API server error.",
  502: "Invalid response received from upstream API.",
  503: "Upstream API is temporarily unavailable.",
  504: "Upstream API request timed out.",
};

export function getStatusMessage(status: number): string {
  return defaultMessages[status] ?? "Unexpected API error.";
}

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiProxyError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.status },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error.",
      },
    },
    { status: 500 },
  );
}
