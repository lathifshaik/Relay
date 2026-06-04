import type { NextRequest } from "next/server";

export async function extractInputs(
  request: NextRequest,
  params: Record<string, string | string[] | undefined>,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};

  // 1. Query string (lowest precedence)
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    out[key] = value;
  }

  // 2. Body for non-GET methods
  if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "DELETE") {
    const body = await safeJson(request);
    if (body !== null && typeof body === "object" && !Array.isArray(body)) {
      for (const [key, value] of Object.entries(body)) {
        out[key] = value;
      }
    }
  }

  // 3. URL path params (highest precedence — they are part of the route shape)
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") out[key] = value;
    else if (Array.isArray(value)) out[key] = value;
  }

  return out;
}

export async function safeJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
